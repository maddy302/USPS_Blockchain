'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * Enroll the admin user
 */

var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');
Fabric_CA_Client.getConfigSetting()
var path = require('path');
var util = require('util');
var os = require('os');
var fs = require('fs');

//make sure we have the profiles we need
var networkConfig = path.join(__dirname, './config/network-profile.json')
var clientConfig = path.join(__dirname, './config/client-profile.json');
checkProfilesExist(networkConfig, clientConfig); //terminates early if they are not found

// load the base network profile
var fabric_client = Fabric_Client.loadFromConfig(networkConfig);

// overlay the client profile over the network profile
fabric_client.loadFromConfig(clientConfig);

var admin_user = null;

var registrar = getAdminEnrollInfo();
console.log("Enrolling using enrollmentId: " + registrar.enrollmentID + ' and EnrollmentSecret: ' + registrar.enrollmentSecret);

// load the user who is going to interact with the network
fabric_client.initCredentialStores().then(() => {
  // first check to see if the admin is already enrolled
  return fabric_client.getUserContext(registrar.enrollmentID, true);
}).then((user_from_store) => {
  if (user_from_store && user_from_store.isEnrolled()) {
    console.log('Successfully loaded admin from persistence');
    admin_user = user_from_store;
    return null;
  } else {
    // need to enroll it with CA server - get the ca client from the configured client
    var fabric_ca_client = fabric_client.getCertificateAuthority();

    return fabric_ca_client.enroll({
      enrollmentID: registrar.enrollmentID,
      enrollmentSecret: registrar.enrollmentSecret
    }).then((enrollment) => {
      console.log('Successfully enrolled admin user "' + registrar.enrollmentID + '" with msp: "' + fabric_client.getMspid());
      return fabric_client.createUser(
        {
          username: registrar.enrollmentID,
          mspid: fabric_client.getMspid(),
          cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
        });
    }).then((user) => {
      admin_user = user;
      return fabric_client.setUserContext(admin_user);
    }).catch((err) => {
      console.error('Failed to enroll and persist admin. Error: ' + err.stack ? err.stack : err);
      throw new Error('Failed to enroll admin');
    });
  }
}).then(() => {
  console.log('Assigned the admin user to the fabric client ::' + admin_user);
}).catch((err) => {
  console.error('Failed to enroll admin: ' + err);
});

function getAdminEnrollInfo()
{
  //currently the SDK does not let us get the enrollSecret from the config so we get it manually
  var config = require(networkConfig);
  var enrollID = '';
  var enrollSecret = '';
  var orgName = '';

  var client = config.client;
  if (client && client.organization) {
    orgName = client.organization;
  } else {
    throw "Organization not found.";
  }

  var caName = config.organizations[orgName].certificateAuthorities[0];
  console.log("Found organization: " + orgName + " and ca name: " + caName);

  var registrar = {};
  if (caName && config.certificateAuthorities[caName].registrar[0]) {
    registrar.enrollmentID = config.certificateAuthorities[caName].registrar[0].enrollId;
    registrar.enrollmentSecret = config.certificateAuthorities[caName].registrar[0].enrollSecret;
  }

  return registrar;
}

function checkProfilesExist(networkConfig, clientConfig) {
  if (!fs.existsSync(networkConfig)) {
    console.log("Error: config file 'network-profile.json' not found.");
    console.log("Make sure 'network-profile.json' is copied into the './config' folder.");
    process.exit()
  }

  //make sure we have the client profile we need

  if (!fs.existsSync(clientConfig)) {
    console.log("Error: config file 'client-profile.json' not found.");
    console.log("Make sure 'client-profile.json' is copied into the './config' folder.");
    process.exit()
  }
}