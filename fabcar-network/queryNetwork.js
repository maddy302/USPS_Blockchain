'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * Chaincode query
 */

var Fabric_Client = require('fabric-client');
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

// setup the fabric network - get the peers and channel that were loaded from the network profile
var channel = fabric_client.getChannel('defaultchannel');

//load the user who is going to interact with the network
fabric_client.initCredentialStores().then(() =>  {
  // get the enrolled user from persistence, this user will sign all requests
  return fabric_client.getUserContext('user1', true);

}).then((user_from_store) => {
  if (user_from_store && user_from_store.isEnrolled()) {
    console.log('Successfully loaded user1 from persistence');

  } else {
    throw new Error('Failed to get user1.... run registerUserNetwork.js');
  }

  // queryCar chaincode function - requires 1 argument, ex: args: ['CAR10'],
  // queryAllCars chaincode function - requires no arguments , ex: args: [''],
	// const request = {
	// 	  chaincodeId: 'fabcar',
	// 	  fcn: 'queryAllCars',
	// 	  args: ['']
  // };
  
if(process.argv.length < 3){
  console.log("ERROR: Insufficient Error")
  return
}  
var key = process.argv[2];

  const request = {
    chaincodeId: 'fabcar',
    fcn: 'queryCar',
    args: [key]};
  // send the query proposal to the peer
  return channel.queryByChaincode(request);
}).then((query_responses) => {
  console.log("Query has completed, checking results");
  // query_responses could have more than one  results if there multiple peers were used as targets
  if (query_responses && query_responses.length == 1) {
    if (query_responses[0] instanceof Error) {
      console.error("error from query = ", query_responses[0]);
    } else {
      console.log("Response is ", query_responses[0].toString());
    }
  } else {
    console.log("No payloads were returned from query");
  }
}).catch((err) => {
  console.error('Failed to query successfully :: ' + err);
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