"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");

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


const publicSubnets = [];
const privateSubnets = [];

const vpc = new aws.ec2.Vpc(vpcName, {
  cidrBlock: vpcCidr,
  tags: {
    Name: vpcName,
  },
});

const getAvailabilityZoneList = async function () {
  const availabilityZones = await aws.getAvailabilityZones({ state: "available", region: region });
  return availabilityZones.names;
}

const creatingInternetGateway = async function(){

// Attach the Internet Gateway to VPC
const internetGateway = new aws.ec2.InternetGateway(
  igatewayName,
  {
    vpcId: vpc.id,
  }
);

return internetGateway;
}

const creatingSubnet = async function(){
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

}

const creatingSecurityGroup = async function (vpc) {
  const appSecGroup = new aws.ec2.SecurityGroup(securityGroupName, {
  description: "Enable access to application",
  vpcId:vpc.id,
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
});
return appSecGroup;
}

const creatingEc2Instances = async function (vpc, publicSubnets, appSecGroup) {
    const ec2instance  = new aws.ec2.Instance(
  ec2Name,{
  instanceType: instanceType,
  securityGroups : [appSecGroup.id],
  ami : amiId,
  subnetId : publicSubnets.id,
  tags : { Name: ec2Name },
  disableApiTermination: false,
  associatePublicIpAddress: true,
  keyName: keyName,
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
}

const mySubnets = creatingSubnet();

mySubnets.then(async () => {
    const appSecGroup = await creatingSecurityGroup(vpc);
    await creatingEc2Instances(vpc, publicSubnets[0], appSecGroup);
});
  