'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * Chaincode Invoke
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

var create = [];
var update = [];
var fcn = "";
//argsv
if(process.argv.length == 7){
var first_value = process.argv[2]; 
var second_value = process.argv[3];
var third_value = process.argv[4]; 
var fourth_value = process.argv[5];
var fifth_value = process.argv[6]; 
fcn = "createCar";
create = [first_value,second_value,third_value,fourth_value,fifth_value]

}else if(process.argv.length == 4){
  var first_value = process.argv[2]; 
  var second_value = process.argv[3];
  update = [first_value,second_value];  
  fcn = "changeCarOwner";
}else{
  console.log("ERROR: Insufficient Argument");
  return;
}

// load the base network profile
var fabric_client = Fabric_Client.loadFromConfig(path.join(__dirname, './config/network-profile.json'));

// overlay the client profile over the network profile
fabric_client.loadFromConfig(path.join(__dirname, './config/client-profile.json'));

// setup the fabric network - get the channel that was loaded from the network profile
var channel = fabric_client.getChannel('defaultchannel');
var tx_id = null;

//load the user who is going to unteract with the network
fabric_client.initCredentialStores().then(() => {
  // get the enrolled user from persistence, this user will sign all requests
  return fabric_client.getUserContext('user1', true);
}).then((user_from_store) => {
  if (user_from_store && user_from_store.isEnrolled()) {
    console.log('Successfully loaded user1 from persistence');

  } else {
    throw new Error('Failed to get user1.... run registerUserNetwork.js');
  }

  // get a transaction id object based on the current user assigned to fabric client
  tx_id = fabric_client.newTransactionID();
  console.log("Assigning transaction_id: ", tx_id._transaction_id);

  // createCar chaincode function - requires 5 args, ex: args: ['CAR11', 'Honda', 'Accord', 'Black', 'Dave'],
  // changeCarOwner chaincode function - requires 2 args , ex: args: ['CAR11', 'MGK'],
  // var request = {
	// 	chaincodeId: 'fabcar',
	// 	fcn: 'initLedger',
	// 	args: [''],
	// 	txId: tx_id
  // };
  // console.log(request);
console.log(create);
console.log(update);
  var request = {
		chaincodeId: 'fabcar',
		fcn: fcn,
		args: process.argv.length == 7 ? create : update,
		txId: tx_id
  };

  // send the transaction proposal to the endorsing peers
  return channel.sendTransactionProposal(request);
}).then((results) => {
  var proposalResponses = results[0];
  var proposal = results[1];
  let isProposalGood = false;
  if (proposalResponses && proposalResponses[0].response &&
    proposalResponses[0].response.status === 200) {
    isProposalGood = true;
    console.log('Transaction proposal was good');
  } else {
    console.error('Transaction proposal was bad');
  }
  if (isProposalGood) {
    console.log(util.format(
      'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
      proposalResponses[0].response.status, proposalResponses[0].response.message));

    // build up the request for the orderer to have the transaction committed
    var request = {
      proposalResponses: proposalResponses,
      proposal: proposal
    };

    // set the transaction listener and set a timeout of 30 sec
    // if the transaction did not get committed within the timeout period,
    // report a TIMEOUT status
    var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
    var promises = [];

    var sendPromise = channel.sendTransaction(request);
    promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

    // get an eventhub once the fabric client has a user assigned. The user
    // is required bacause the event registration must be signed
    console.error('Getting event hub');
    let event_hub = fabric_client.getEventHub('org1-peer1');

    // using resolve the promise so that result status may be processed
    // under the then clause rather than having the catch clause process
    // the status
    let txPromise = new Promise((resolve, reject) => {
      let handle = setTimeout(() => {
        event_hub.disconnect();
        resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
      }, 3000);
      event_hub.connect();
      event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
        // this is the callback for transaction event status
        // first some clean up of event listener
        clearTimeout(handle);
        event_hub.unregisterTxEvent(transaction_id_string);
        event_hub.disconnect();

        // now let the application know what happened
        var return_status = { event_status: code, tx_id: transaction_id_string };
        if (code !== 'VALID') {
          console.error('The transaction was invalid, code = ' + code);
          resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
        } else {
          console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
          resolve(return_status);
        }
      }, (err) => {
        //this is the callback if something goes wrong with the event registration or processing
        reject(new Error('There was a problem with the eventhub ::' + err));
      });
    });
    promises.push(txPromise);

    return Promise.all(promises);
  } else {
    console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
    throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
  }
}).then((results) => {
  console.log('Send transaction promise and event listener promise have completed');
  // check the results in the order the promises were added to the promise all list
  if (results && results[0] && results[0].status === 'SUCCESS') {
    console.log('Successfully sent transaction to the orderer.');
  } else {
    console.error('Failed to order the transaction. Error code: ' + response.status);
  }

  if (results && results[1] && results[1].event_status === 'VALID') {
    console.log('Successfully committed the change to the ledger by the peer');
  } else {
    console.log('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
  }
}).catch((err) => {
  console.error('Failed to invoke successfully :: ' + err);
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