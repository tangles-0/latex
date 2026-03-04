import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as rds from "aws-cdk-lib/aws-rds";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { EnvironmentConfig } from "./config";

type DataStackProps = cdk.StackProps & {
  config: EnvironmentConfig;
  vpc: ec2.IVpc;
  appSecurityGroup: ec2.ISecurityGroup;
};

export class DataStack extends cdk.Stack {
  public readonly imageBucket: s3.Bucket;
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbCredentialsSecret: secretsmanager.ISecret;
  public readonly appSecret: secretsmanager.Secret;
  public readonly rateLimitTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const prefix = `${props.config.appName}-${props.config.environment}`;

    const dataKey = new kms.Key(this, "DataKey", {
      alias: `alias/${prefix}-data`,
      enableKeyRotation: true,
    });

    const imageBucketLifecycleRules: s3.LifecycleRule[] = [];
    if (props.config.s3Versioned && props.config.s3NoncurrentVersionExpirationDays > 0) {
      imageBucketLifecycleRules.push({
        noncurrentVersionExpiration: cdk.Duration.days(props.config.s3NoncurrentVersionExpirationDays),
      });
    }

    this.imageBucket = new s3.Bucket(this, "ImageBucket", {
      bucketName: `${prefix}-images-${this.account}-${this.region}`,
      encryption: props.config.s3UseKmsEncryption ? s3.BucketEncryption.KMS : s3.BucketEncryption.S3_MANAGED,
      encryptionKey: props.config.s3UseKmsEncryption ? dataKey : undefined,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: props.config.s3Versioned,
      lifecycleRules: imageBucketLifecycleRules,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: [
            "Accept-Ranges",
            "Content-Length",
            "Content-Range",
            "Content-Type",
            "ETag",
            "Last-Modified",
            "x-amz-request-id",
            "x-amz-id-2",
          ],
          maxAge: 3600,
        },
      ],
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc: props.vpc,
      allowAllOutbound: false,
      description: "RDS PostgreSQL security group",
      securityGroupName: `${prefix}-db-sg`,
    });
    dbSecurityGroup.addIngressRule(props.appSecurityGroup, ec2.Port.tcp(5432));

    const dbInstanceType = (() => {
      switch (props.config.dbInstanceType) {
        case "t4g.micro":
          return ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO);
        case "t4g.small":
          return ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL);
        case "t4g.medium":
          return ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM);
        case "t4g.large":
          return ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.LARGE);
        default:
          throw new Error(
            `Unsupported dbInstanceType '${props.config.dbInstanceType}'. Expected one of: t4g.micro, t4g.small, t4g.medium, t4g.large.`,
          );
      }
    })();

    this.dbInstance = new rds.DatabaseInstance(this, "Database", {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      databaseName: "latex",
      credentials: rds.Credentials.fromGeneratedSecret("latex_app"),
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: dbInstanceType,
      allocatedStorage: props.config.dbAllocatedStorageGiB,
      maxAllocatedStorage: props.config.dbAllocatedStorageGiB * 4,
      storageEncrypted: true,
      multiAz: props.config.dbMultiAz,
      backupRetention: cdk.Duration.days(props.config.dbBackupRetentionDays),
      deleteAutomatedBackups: false,
      deletionProtection: props.config.environment === "prod",
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
    });
    this.dbCredentialsSecret = this.dbInstance.secret as secretsmanager.ISecret;

    this.appSecret = new secretsmanager.Secret(this, "AppRuntimeSecret", {
      secretName: `${prefix}/app/runtime`,
      description: "Runtime app secrets for latex",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "NEXTAUTH_SECRET",
        passwordLength: 64,
      },
    });

    this.rateLimitTable = new dynamodb.Table(this, "RateLimitTable", {
      tableName: `${prefix}-rate-limit`,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: dataKey,
      removalPolicy:
        props.config.environment === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
  }
}

