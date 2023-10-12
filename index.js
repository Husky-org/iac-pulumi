"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");
//require("dotenv").config();

const config = new pulumi.Config();
// console.log("here..." + config.requireObject("iac-pulumi:data"));

// const provider = new aws.Provider("my-provider", {
//   region: config.require("aws:accessKey"),
//   accessKey: config.require("aws:accessKey"),
//   secretKey: config.require("aws:secretKey"),
// });

const vpc = new aws.ec2.Vpc(
  "my-vpc",
  {
    cidrBlock: config.require("cidr-block"),
    tags: {
      Name: "my-vpc",
    },
  }
  //  { provider: provider }
);

//Internet Gateway
const internetGateway = new aws.ec2.InternetGateway("internetGateway", {});

// Attach the Internet Gateway to VPC
const internetGatewayAttachment = new aws.ec2.InternetGatewayAttachment(
  "internetGatewayAttachment",
  {
    vpcId: vpc.id,
    internetGatewayId: internetGateway.id,
  }
);

const availabilityZones = ["us-east-1a", "us-east-1b", "us-east-1c"];

const publicSubnets = [];
const privateSubnets = [];

// Create 3 public and 3 private subnets in specified availability zones.
for (let i = 0; i < 3; i++) {
  const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
    vpcId: vpc.id,
    availabilityZone: availabilityZones[i],
    cidrBlock: `10.0.${i * 8}.0/24`,
    mapPublicIpOnLaunch: true,
    tags: {
      Name: `public-subnet-${i}`,
    },
  });
  publicSubnets.push(publicSubnet);

  const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
    vpcId: vpc.id,
    availabilityZone: availabilityZones[i],
    cidrBlock: `10.0.${i * 8 + 128}.0/24`,
    tags: {
      Name: `private-subnet-${i}`,
    },
  });
  privateSubnets.push(privateSubnet);
}

//public route table
const publicRouteTable = new aws.ec2.RouteTable("my-public-routetable", {
  vpcId: vpc.id,
  tags: {
    Name: "my-public-routetable",
  },
});

// Create a default route in the public route table that directs traffic to the Internet Gateway
const publicRoute = new aws.ec2.Route("public-route", {
  routeTableId: publicRouteTable.id,
  destinationCidrBlock: "0.0.0.0/0",
  gatewayId: internetGateway.id,
});

// Attach all public subnets to the public route table
publicSubnets.forEach((publicSubnet, index) => {
  const subnetAssociation = new aws.ec2.RouteTableAssociation(
    `public-subnet-association-${index}`,
    {
      routeTableId: publicRouteTable.id,
      subnetId: publicSubnet.id,
    }
  );
});

// private route table
const privateRouteTable = new aws.ec2.RouteTable("private-route-table", {
  vpcId: vpc.id,
  tags: {
    Name: "private-route-table",
  },
});

// Iterate through private subnets and associate them with the private route table
for (let i = 0; i < privateSubnets.length; i++) {
  const subnetAssociation = new aws.ec2.RouteTableAssociation(
    `private-subnet-association-${i}`,
    {
      routeTableId: privateRouteTable.id,
      subnetId: privateSubnets[i].id,
    }
  );
}
