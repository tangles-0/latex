export type EnvironmentName = "dev" | "prod";

export type EnvironmentConfig = {
  appName: string;
  environment: EnvironmentName;
  region: string;
  appDomain: string;
  cpu: number;
  memoryMiB: number;
  desiredCount: number;
  minTasks: number;
  maxTasks: number;
  dbAllocatedStorageGiB: number;
  dbInstanceType: string;
  dbMultiAz: boolean;
  dbBackupRetentionDays: number;
  s3UseKmsEncryption: boolean;
  s3Versioned: boolean;
  s3NoncurrentVersionExpirationDays: number;
  passwordResetTokenTtlMinutes: number;
};

const BASE = {
  appName: "latex",
  region: "ap-southeast-2",
  passwordResetTokenTtlMinutes: 30,
} as const;

const CONFIG_BY_ENV: Record<EnvironmentName, Omit<EnvironmentConfig, "environment">> = {
  dev: {
    ...BASE,
    appDomain: "dev.pics.latex.gg",
    cpu: 256,
    memoryMiB: 512,
    desiredCount: 1,
    minTasks: 1,
    maxTasks: 1,
    dbAllocatedStorageGiB: 20,
    dbInstanceType: "t4g.micro",
    dbMultiAz: false,
    dbBackupRetentionDays: 1,
    s3UseKmsEncryption: false,
    s3Versioned: false,
    s3NoncurrentVersionExpirationDays: 0,
  },
  prod: {
    ...BASE,
    appDomain: "pics.latex.gg",
    cpu: 256,
    memoryMiB: 512,
    desiredCount: 1,
    minTasks: 1,
    maxTasks: 3,
    dbAllocatedStorageGiB: 50,
    dbInstanceType: "t4g.micro",
    dbMultiAz: false,
    dbBackupRetentionDays: 7,
    s3UseKmsEncryption: true,
    s3Versioned: true,
    s3NoncurrentVersionExpirationDays: 30,
  },
};

export function getEnvironmentConfig(input: string): EnvironmentConfig {
  if (input !== "dev" && input !== "prod") {
    throw new Error(`Unsupported env '${input}'. Use -c env=dev or -c env=prod.`);
  }

  return {
    environment: input,
    ...CONFIG_BY_ENV[input],
  };
}

