import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { EnvironmentConfig } from "./config";

type AppStackProps = cdk.StackProps & {
  config: EnvironmentConfig;
  vpc: ec2.IVpc;
  cluster: ecs.ICluster;
  albSecurityGroup: ec2.ISecurityGroup;
  appSecurityGroup: ec2.ISecurityGroup;
  imageBucket: s3.IBucket;
  dbInstance: rds.IDatabaseInstance;
  dbCredentialsSecret: secretsmanager.ISecret;
  appSecret: secretsmanager.ISecret;
  rateLimitTable: dynamodb.ITable;
  imageTag: string;
  certificateArn: string;
  desiredCountOverride?: number;
};

export class AppStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly ecrRepository: ecr.IRepository;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const prefix = `${props.config.appName}-${props.config.environment}`;

    this.ecrRepository = ecr.Repository.fromRepositoryName(this, "AppRepository", `${prefix}-app`);

    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Runtime role for latex ECS tasks",
    });
    const billingReaderRole = new iam.Role(this, "BillingReaderRole", {
      assumedBy: new iam.ArnPrincipal(taskRole.roleArn),
      description: "Read-only role for Cost Explorer billing queries",
    });
    billingReaderRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "ce:GetCostAndUsage",
          "ce:GetDimensionValues",
          "ce:GetTags",
        ],
        resources: ["*"],
      }),
    );
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [billingReaderRole.roleArn],
      }),
    );
    props.imageBucket.grantReadWrite(taskRole);
    props.imageBucket.encryptionKey?.grantEncryptDecrypt(taskRole);
    props.appSecret.grantRead(taskRole);
    props.dbCredentialsSecret.grantRead(taskRole);
    props.rateLimitTable.grantReadWriteData(taskRole);

    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
      cpu: props.config.cpu,
      memoryLimitMiB: props.config.memoryMiB,
      taskRole,
      family: `${prefix}-task`,
    });

    const container = taskDef.addContainer("LatexContainer", {
      image: ecs.ContainerImage.fromEcrRepository(this.ecrRepository, props.imageTag),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${prefix}-app` }),
      environment: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
        STORAGE_BACKEND: "s3",
        S3_BUCKET: props.imageBucket.bucketName,
        S3_REGION: this.region,
        NEXTAUTH_URL: `https://${props.config.appDomain}`,
        PGHOST: props.dbInstance.dbInstanceEndpointAddress,
        PGPORT: props.dbInstance.dbInstanceEndpointPort,
        PGDATABASE: "latex",
        PGSSLMODE: "require",
        RATE_LIMIT_BACKEND: "dynamodb",
        RATE_LIMIT_TABLE: props.rateLimitTable.tableName,
        RATE_LIMIT_WINDOW_MS: "300000",
        RATE_LIMIT_MAX_ATTEMPTS: "20",
        BILLING_ROLE_ARN: billingReaderRole.roleArn,
        BILLING_CE_REGION: "us-east-1",
        PASSWORD_RESET_TOKEN_TTL_MINUTES: props.config.passwordResetTokenTtlMinutes.toString(),
      },
      secrets: {
        NEXTAUTH_SECRET: ecs.Secret.fromSecretsManager(props.appSecret, "NEXTAUTH_SECRET"),
        ADMIN_BOOTSTRAP_TOKEN: ecs.Secret.fromSecretsManager(props.appSecret, "ADMIN_BOOTSTRAP_TOKEN"),
        DB_PUSH_PW: ecs.Secret.fromSecretsManager(props.appSecret, "DB_PUSH_PW"),
        PGUSER: ecs.Secret.fromSecretsManager(props.dbCredentialsSecret, "username"),
        PGPASSWORD: ecs.Secret.fromSecretsManager(props.dbCredentialsSecret, "password"),
        RESEND_API_KEY: ecs.Secret.fromSecretsManager(props.appSecret, "RESEND_API_KEY"),
      },
      readonlyRootFilesystem: true,
    });
    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    this.service = new ecs.FargateService(this, "Service", {
      cluster: props.cluster,
      taskDefinition: taskDef,
      serviceName: `${prefix}-svc`,
      desiredCount: props.desiredCountOverride ?? props.config.desiredCount,
      securityGroups: [props.appSecurityGroup],
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(90),
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
      loadBalancerName: `${prefix}-alb`,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      dropInvalidHeaderFields: true,
      deletionProtection: props.config.environment === "prod",
      desyncMitigationMode: elbv2.DesyncMitigationMode.STRICTEST,
    });

    this.loadBalancer.setAttribute("routing.http.desync_mitigation_mode", "strictest");
    this.loadBalancer.setAttribute("routing.http.x_amzn_tls_version_and_cipher_suite.enabled", "true");

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "HttpsCertificate",
      props.certificateArn,
    );

    const httpsListener = this.loadBalancer.addListener("HttpsListener", {
      port: 443,
      open: true,
      certificates: [certificate],
    });

    this.targetGroup = new elbv2.ApplicationTargetGroup(this, "TargetGroup", {
      vpc: props.vpc,
      targetType: elbv2.TargetType.IP,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: "/api/health",
        healthyHttpCodes: "200",
        interval: cdk.Duration.seconds(30),
      },
    });
    this.targetGroup.addTarget(this.service);
    httpsListener.addTargetGroups("AppTargetGroupHttps", {
      targetGroups: [this.targetGroup],
    });

    this.loadBalancer.addListener("HttpListener", {
      port: 80,
      open: true,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });

    const scalableTarget = this.service.autoScaleTaskCount({
      minCapacity: props.config.minTasks,
      maxCapacity: props.config.maxTasks,
    });
    scalableTarget.scaleOnCpuUtilization("CpuScaling", { targetUtilizationPercent: 60 });
    scalableTarget.scaleOnMemoryUtilization("MemoryScaling", { targetUtilizationPercent: 70 });

    new cdk.CfnOutput(this, "ServiceUrl", {
      value: `http://${this.loadBalancer.loadBalancerDnsName}`,
    });
    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: this.ecrRepository.repositoryUri,
    });
    new cdk.CfnOutput(this, "ClusterName", {
      value: props.cluster.clusterName,
    });
    new cdk.CfnOutput(this, "ServiceName", {
      value: this.service.serviceName,
    });
    new cdk.CfnOutput(this, "TaskDefinitionArn", {
      value: taskDef.taskDefinitionArn,
    });
  }
}

