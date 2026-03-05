import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import { EnvironmentConfig } from "./config";

type CiCdStackProps = cdk.StackProps & {
  config: EnvironmentConfig;
  githubOrg: string;
  githubRepo: string;
};

export class CiCdStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CiCdStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, "GithubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const appRoleResourcePattern = `arn:aws:iam::${this.account}:role/${props.config.appName}-*`;
    const cdkBootstrapRolePattern = `arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`;

    const basePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: [
            "cloudformation:*",
            "ec2:*",
            "ecs:*",
            "ecr:*",
            "elasticloadbalancing:*",
            "logs:*",
            "dynamodb:*",
            "rds:*",
            "secretsmanager:*",
            "kms:*",
            "s3:*",
            "ssm:*",
            "sts:GetCallerIdentity",
          ],
          // TODO: Restrict to only the necessary resources
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: [
            "iam:PassRole",
            "iam:GetRole",
            "iam:CreateRole",
            "iam:AttachRolePolicy",
            "iam:PutRolePolicy",
            "iam:DeleteRolePolicy",
            "iam:DetachRolePolicy",
            "iam:TagRole",
            "iam:UntagRole",
          ],
          resources: [appRoleResourcePattern, cdkBootstrapRolePattern],
        }),
      ],
    });

    this.createRole("DevDeployRole", {
      provider,
      policy: basePolicy,
      githubSub: `repo:${props.githubOrg}/${props.githubRepo}:ref:refs/heads/*`,
      roleName: `${props.config.appName}-github-deploy-dev`,
    });

    this.createRole("ProdDeployRole", {
      provider,
      policy: basePolicy,
      githubSub: `repo:${props.githubOrg}/${props.githubRepo}:ref:refs/tags/*`,
      roleName: `${props.config.appName}-github-deploy-prod`,
    });
  }

  private createRole(
    id: string,
    input: {
      provider: iam.IOpenIdConnectProvider;
      policy: iam.PolicyDocument;
      githubSub: string;
      roleName: string;
    },
  ): iam.Role {
    return new iam.Role(this, id, {
      roleName: input.roleName,
      assumedBy: new iam.WebIdentityPrincipal(input.provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": input.githubSub,
        },
      }),
      inlinePolicies: {
        DeployPolicy: input.policy,
      },
    });
  }
}

