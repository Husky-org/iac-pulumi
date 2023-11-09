"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");
const fs = require("fs");

const config = new pulumi.Config();

const vpcCidr = config.require("vpc-cidr-block");
const vpcName = config.require("vpc-name");
const region = config.require("region");
const igatewayName = config.require("internet-gateway-name");
const igatewayAttachName = config.require("internet-gateway-attachment-name");
const publicRTName = config.require("public-rt-name");
const privateRTName = config.require("private-rt-name");
const igateCidr = config.require("internet-gateway-cidr");
const publicSubPrefix = config.require("publicSubPrefix");
const privateSubPrefix = config.require("privateSubPrefix");
const publicRouteName = config.require("public-route-name");
const publicSubAssociationPrefix = config.require(
  "public-SubAssociationPrefix"
);
const privateSubAssociationPrefix = config.require(
  "private-SubAssociationPrefix"
);
const numOfSubnets = config.require("num_of_subnets");
const webappPort = config.require("web-app-port");
const keyName = config.require("key-name");
const securityGroupName = config.require("security-group-name");
const ec2Name = config.require("ec2-name");
const instanceType = config.require("instance-type");
const ec2WebServerBlock = config.require("device-name");
const deviceVolume = config.require("device-volume");
const deviceVolumeType = config.require("device-volume-type");
const amiId = config.require("ami-id");
const sshPort = config.require("ssh-port");
const httpPort = config.require("http-port");
const httpsPort = config.require("https-port");
const dbName = config.require("db-name");
const webappDb = config.require("webapp-db-user");
const dbPassword = config.require("db-password");
const dbHost = config.require("db-host");
const dbDialect = config.require("db-dialect");
const dbPort = config.require("db-port");
const dbVolume = config.require("db-volume");
const dbClass = config.require("db-class");
const dbEngine = config.require("db-engine-version");
const parameterFamily = config.require("parameter-group-family");
const publicSubnets = [];
const privateSubnets = [];
const route53RecordTtl = config.require("route53-record-ttl");
const domain = config.require("domain");
const policyArn = config.require("policy-arn");

const vpc = new aws.ec2.Vpc(vpcName, {
  cidrBlock: vpcCidr,
  tags: {
    Name: vpcName,
  },
  enableDnsSupport: true,
});

const getAvailabilityZoneList = async function () {
  const availabilityZones = await aws.getAvailabilityZones({
    state: "available",
    region: region,
  });
  return availabilityZones.names;
};

const creatingInternetGateway = async function () {
  // Attach the Internet Gateway to VPC
  const internetGateway = new aws.ec2.InternetGateway(igatewayName, {
    vpcId: vpc.id,
  });

  return internetGateway;
};

const creatingSubnet = async function () {
  const availabilityZones = await getAvailabilityZoneList();

  const numSubnets = Math.min(availabilityZones.length, numOfSubnets);

  const internetGateway = await creatingInternetGateway(vpc);

  //public route table
  const publicRouteTable = new aws.ec2.RouteTable(publicRTName, {
    vpcId: vpc.id,
    tags: {
      Name: publicRTName,
    },
  });

  // private route table
  const privateRouteTable = new aws.ec2.RouteTable(privateRTName, {
    vpcId: vpc.id,
    tags: {
      Name: privateRTName,
    },
  });

  // Create 3 public and 3 private subnets in specified availability zones.
  for (let i = 0; i < numSubnets; i++) {
    const publicSubnet = new aws.ec2.Subnet(`${publicSubPrefix}${i}`, {
      vpcId: vpc.id,
      availabilityZone: availabilityZones[i],
      cidrBlock: `10.0.${i * 8}.0/24`,
      mapPublicIpOnLaunch: true,
      tags: {
        Name: `${publicSubPrefix}${i}`,
      },
    });
    publicSubnets.push(publicSubnet);

    const privateSubnet = new aws.ec2.Subnet(`${privateSubPrefix}${i}`, {
      vpcId: vpc.id,
      availabilityZone: availabilityZones[i],
      cidrBlock: `10.0.${i * 8 + 1}.0/24`,
      tags: {
        Name: `${privateSubPrefix}${i}`,
      },
    });
    privateSubnets.push(privateSubnet);

    new aws.ec2.RouteTableAssociation(`${publicSubAssociationPrefix}${i}`, {
      routeTableId: publicRouteTable.id,
      subnetId: publicSubnet.id,
    });

    new aws.ec2.RouteTableAssociation(`${privateSubAssociationPrefix}${i}`, {
      routeTableId: privateRouteTable.id,
      subnetId: privateSubnet.id,
    });
  }

  // Create a default route in the public route table that directs traffic to the Internet Gateway
  const publicRoute = new aws.ec2.Route(publicRouteName, {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: igateCidr,
    gatewayId: internetGateway.id,
  });
};

const creatingSecurityGroup = async function (vpc) {
  const appSecGroup = new aws.ec2.SecurityGroup(securityGroupName, {
    description: "Enable access to application",
    vpcId: vpc.id,
    ingress: [
      {
        fromPort: sshPort,
        toPort: sshPort,
        protocol: "tcp",
        cidrBlocks: [igateCidr],
      },
      {
        fromPort: httpPort,
        toPort: httpPort,
        protocol: "tcp",
        cidrBlocks: [igateCidr],
      },
      {
        fromPort: httpsPort,
        toPort: httpsPort,
        protocol: "tcp",
        cidrBlocks: [igateCidr],
      },
      {
        fromPort: webappPort,
        toPort: webappPort,
        protocol: "tcp",
        cidrBlocks: [igateCidr],
      },
    ],
    egress: [
      {
        fromPort: dbPort,
        toPort: dbPort,
        protocol: "tcp",
        cidrBlocks: [igateCidr],
      },
      {
        fromPort: httpsPort,
        toPort: httpsPort,
        protocol: "tcp",
        cidrBlocks: [igateCidr],
      },
    ],
  });
  return appSecGroup;
};

const creatingCloudWatchRole = async function () {
  const role = new aws.iam.Role("ec2Role", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Principal: {
            Service: "ec2.amazonaws.com",
          },
          Effect: "Allow",
        },
      ],
    }),
  });

  const policyAttachment = new aws.iam.PolicyAttachment(
    "role-policy-attachment",
    {
      roles: [role.name],
      policyArn: policyArn,
    }
  );

  const instanceProfile = new aws.iam.InstanceProfile("instanceProfile", {
    role: role.name,
  });
  return instanceProfile;
};

const creatingEc2Instances = async function (
  vpc,
  publicSubnets,
  appSecGroup,
  userDataScript,
  instanceProfile
) {
  const ec2instance = new aws.ec2.Instance(ec2Name, {
    instanceType: instanceType,
    securityGroups: [appSecGroup.id],
    ami: amiId,
    subnetId: publicSubnets.id,
    iamInstanceProfile: instanceProfile.name,
    tags: { Name: ec2Name },
    disableApiTermination: false,
    associatePublicIpAddress: true,
    keyName: keyName,
    userData: userDataScript,
    blockDeviceMappings: [
      {
        deviceName: ec2WebServerBlock,
        ebs: {
          volumeSize: deviceVolume,
          volumeType: deviceVolumeType,
          deleteOnTermination: true,
        },
      },
    ],
  });
  return ec2instance;
};

const databaseSecurityGroup = async function (vpc, appSecGroup) {
  const dbSecGroup = new aws.ec2.SecurityGroup("Database security group", {
    description: "Security group for db",
    vpcId: vpc.id,
    ingress: [
      {
        fromPort: dbPort,
        toPort: dbPort,
        protocol: "tcp",
        securityGroups: [appSecGroup.id],
      },
    ],
    egress: [
      { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: [igateCidr] },
      {
        fromPort: webappPort,
        toPort: webappPort,
        protocol: "tcp",
        securityGroups: [appSecGroup.id],
      },
    ],
  });
  return dbSecGroup;
};

const ParameterGroup = async function () {
  let pgForRds = new aws.rds.ParameterGroup("parametergroupforrds", {
    family: parameterFamily,
  });
  return pgForRds;
};

const dbSubnetGroup = async function () {
  const subnetGroup = new aws.rds.SubnetGroup("dbsubnetgroup", {
    subnetIds: [privateSubnets[0].id, privateSubnets[1].id],
    tags: {
      Name: "DB subnet group",
    },
  });
  return subnetGroup;
};

const createRdsInstance = async function (dbSecGroup, subnetGroup, pgForRds) {
  const rdsInstance = new aws.rds.Instance(dbName, {
    allocatedStorage: dbVolume,
    engine: dbDialect,
    engineVersion: dbEngine,
    instanceClass: dbClass,
    dbName: dbName,
    password: dbPassword,
    username: webappDb,
    storageType: deviceVolumeType,
    skipFinalSnapshot: true,
    publiclyAccessible: false,
    multiAz: false,
    vpcSecurityGroupIds: [dbSecGroup.id],
    dbSubnetGroupName: subnetGroup.name,
    parameterGroupName: pgForRds.name,
  });
  return rdsInstance;
};

const createArecord = async function (ec2instance) {
  const zoneName = pulumi.getStack() + "." + domain;
  let zoneId = aws.route53.getZone({ name: zoneName }, { async: true });

  let aRecord = new aws.route53.Record("web-server-record", {
    name: zoneName,
    type: "A",
    ttl: route53RecordTtl,
    records: [ec2instance.publicIp],
    zoneId: zoneId.then((zone) => zone.zoneId),
  });
  return aRecord;
};

const mySubnets = creatingSubnet();

mySubnets.then(async () => {
  const appSecGroup = await creatingSecurityGroup(vpc);
  const dbSecGroup = await databaseSecurityGroup(vpc, appSecGroup);
  const pgForRds = await ParameterGroup();
  const subnetGroup = await dbSubnetGroup();
  const rdsInstance = await createRdsInstance(
    dbSecGroup,
    subnetGroup,
    pgForRds
  );

  const userDataScript = pulumi.interpolate`#!/bin/bash
  set -x
  sudo touch /var/log/csye6225_stdop.log
  sudo touch /var/log/csye6225_error.log
  sudo chown csye6225:csye6225 /var/log/csye6225_stdop.log /var/log/csye6225_error.log
  
  DB_NAME=${dbName};
  WEBAPP_DB_USER=${webappDb};
  DB_PASSWORD=${dbPassword};
  DB_HOST=${rdsInstance.address}; 
  DB_DIALECT=${dbDialect};

  cd /opt/csye6225
  sudo touch .env
  echo "DB_NAME=\${DB_NAME}" >> .env
  echo "DB_USER=\${WEBAPP_DB_USER}" >> .env
  echo "DB_PASSWORD=\${DB_PASSWORD}" >> .env
  echo "DB_HOST=\${DB_HOST}" >> .env
  echo "DB_DIALECT=\${DB_DIALECT}" >> .env

  sudo chown -R csye6225:csye6225 /opt/csye6225

  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/aws/amazon-cloudwatch-agent/cloudwatch-config.json \
    -s

    sudo systemctl restart amazon-cloudwatch-agent
    sudo systemctl restart csye6225
  `;

  const instanceProfile = await creatingCloudWatchRole();
  const ec2instance = await creatingEc2Instances(
    vpc,
    publicSubnets[0],
    appSecGroup,
    userDataScript,
    instanceProfile
  );

  const aRecord = await createArecord(ec2instance);
});
