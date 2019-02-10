'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * Register and Enroll a user
 */

var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');

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

var userName = 'user1';
var fabric_ca_client = null;

//load the user who is going to interact with the network
fabric_client.initCredentialStores().then(() => {
  // first check to see if the admin is already enrolled
  return fabric_client.getUserContext('admin', true);
}).then((admin_user) => {
  if (admin_user && admin_user.isEnrolled()) {
    console.log('Successfully loaded admin from persistence');
  } else {
    throw new Error('Failed to get admin.... run enrollAdminNetwork.js');
  }

  // get the ca client from the configured client
  fabric_ca_client = fabric_client.getCertificateAuthority();

  // at this point we should have the admin user so now register the user with the CA server
  return fabric_ca_client.register({ enrollmentID: userName, affiliation: 'org1.department1', role: 'client' }, admin_user);
}).then((secret) => {
  // next we need to enroll the user with CA server
  console.log('Successfully registered "' + userName + '" - with secret:' + secret);

  return fabric_ca_client.enroll({ enrollmentID: userName, enrollmentSecret: secret });
}).then((enrollment) => {
  console.log('Successfully enrolled member user "' + userName + '" with msp: "' + fabric_client.getMspid() + '"' );
  return fabric_client.createUser(
    {
      username: userName,
      mspid: fabric_client.getMspid(),
      cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
    });
}).then((member_user) => {
  return fabric_client.setUserContext(member_user);
}).then(() => {
  console.log('"' + userName + '" was successfully registered and enrolled and is ready to interact with the fabric network');
}).catch((err) => {
  console.error('Failed to register: ' + err);
  if (err.toString().indexOf('Authorization') > -1) {
    console.error('Authorization failures may be caused by having admin credentials from a previous CA instance.\n' +
      'Try again after deleting the contents of the store directory hfc-key-store');
  }
});

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