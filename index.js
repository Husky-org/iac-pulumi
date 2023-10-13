"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");

const config = new pulumi.Config();

const vpcCidr = config.require("vpc-cidr-block");
const vpcName = config.require("vpc-name");
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

const vpc = new aws.ec2.Vpc(vpcName, {
  cidrBlock: vpcCidr,
  tags: {
    Name: vpcName,
  },
});

//Internet Gateway
const internetGateway = new aws.ec2.InternetGateway(igatewayName, {});

// Attach the Internet Gateway to VPC
const internetGatewayAttachment = new aws.ec2.InternetGatewayAttachment(
  igatewayAttachName,
  {
    vpcId: vpc.id,
    internetGatewayId: internetGateway.id,
  }
);

//const availabilityZones = ["us-east-1a", "us-east-1b", "us-east-1c"];

const availabilityZones = pulumi.output(
  aws.getAvailabilityZones({ state: "available" })
).names;

const publicSubnets = [];
const privateSubnets = [];

let numSubnets;
if (availabilityZones.length <= numOfSubnets) {
  numSubnets = availabilityZones.length;
} else {
  numSubnets = numOfSubnets;
}

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
}

//public route table
const publicRouteTable = new aws.ec2.RouteTable(publicRTName, {
  vpcId: vpc.id,
  tags: {
    Name: publicRTName,
  },
});

// Create a default route in the public route table that directs traffic to the Internet Gateway
const publicRoute = new aws.ec2.Route(publicRouteName, {
  routeTableId: publicRouteTable.id,
  destinationCidrBlock: igateCidr,
  gatewayId: internetGateway.id,
});

// Attach all public subnets to the public route table
publicSubnets.forEach((publicSubnet, index) => {
  const subnetAssociation = new aws.ec2.RouteTableAssociation(
    `${publicSubAssociationPrefix}${index}`,
    {
      routeTableId: publicRouteTable.id,
      subnetId: publicSubnet.id,
    }
  );
});

// private route table
const privateRouteTable = new aws.ec2.RouteTable(privateRTName, {
  vpcId: vpc.id,
  tags: {
    Name: privateRTName,
  },
});

// Iterate through private subnets and associate them with the private route table
for (let i = 0; i < privateSubnets.length; i++) {
  const subnetAssociation = new aws.ec2.RouteTableAssociation(
    `${privateSubAssociationPrefix}${i}`,
    {
      routeTableId: privateRouteTable.id,
      subnetId: privateSubnets[i].id,
    }
  );
}
