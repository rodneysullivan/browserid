/*jshint browsers:true, forin: true, laxbreak: true */
/*global test: true, start: true, module: true, ok: true, equal: true, BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
var jwk = require("./jwk");
var jwt = require("./jwt");
var jwcert = require("./jwcert");
var vep = require("./vep");

(function() {
  var bid = BrowserID,
      lib = bid.User,
      storage = bid.Storage,
      network = bid.Network,
      xhr = bid.Mocks.xhr,
      testHelpers = bid.TestHelpers,
      testOrigin = testHelpers.testOrigin,
      failureCheck = testHelpers.failureCheck,
      provisioning = bid.Mocks.Provisioning

  // I generated these locally, they are used nowhere else.
  var pubkey = {"algorithm":"RS","n":"56063028070432982322087418176876748072035482898334811368408525596198252519267108132604198004792849077868951906170812540713982954653810539949384712773390200791949565903439521424909576832418890819204354729217207360105906039023299561374098942789996780102073071760852841068989860403431737480182725853899733706069","e":"65537"};

  // this cert is meaningless, but it has the right format
  var random_cert = "eyJhbGciOiJSUzEyOCJ9.eyJpc3MiOiJpc3N1ZXIuY29tIiwiZXhwIjoxMzE2Njk1MzY3NzA3LCJwdWJsaWMta2V5Ijp7ImFsZ29yaXRobSI6IlJTIiwibiI6IjU2MDYzMDI4MDcwNDMyOTgyMzIyMDg3NDE4MTc2ODc2NzQ4MDcyMDM1NDgyODk4MzM0ODExMzY4NDA4NTI1NTk2MTk4MjUyNTE5MjY3MTA4MTMyNjA0MTk4MDA0NzkyODQ5MDc3ODY4OTUxOTA2MTcwODEyNTQwNzEzOTgyOTU0NjUzODEwNTM5OTQ5Mzg0NzEyNzczMzkwMjAwNzkxOTQ5NTY1OTAzNDM5NTIxNDI0OTA5NTc2ODMyNDE4ODkwODE5MjA0MzU0NzI5MjE3MjA3MzYwMTA1OTA2MDM5MDIzMjk5NTYxMzc0MDk4OTQyNzg5OTk2NzgwMTAyMDczMDcxNzYwODUyODQxMDY4OTg5ODYwNDAzNDMxNzM3NDgwMTgyNzI1ODUzODk5NzMzNzA2MDY5IiwiZSI6IjY1NTM3In0sInByaW5jaXBhbCI6eyJlbWFpbCI6InRlc3R1c2VyQHRlc3R1c2VyLmNvbSJ9fQ.aVIO470S_DkcaddQgFUXciGwq2F_MTdYOJtVnEYShni7I6mqBwK3fkdWShPEgLFWUSlVUtcy61FkDnq2G-6ikSx1fUZY7iBeSCOKYlh6Kj9v43JX-uhctRSB2pI17g09EUtvmb845EHUJuoowdBLmLa4DSTdZE-h4xUQ9MsY7Ik";


  function testAssertion(assertion, cb) {
    equal(typeof assertion, "string", "An assertion was correctly generated");

    // Decode the assertion to a bundle.
    // var bundle = JSON.parse(window.atob(assertion));
    // WOW, ^^ was assuming a specific format, let's fix that
    var bundle = vep.unbundleCertsAndAssertion(assertion);

    // Make sure both parts of the bundle exist
    ok(bundle.certificates && bundle.certificates.length, "we have an array like object for the certificates");
    equal(typeof bundle.assertion, "string");

    // Decode the assertion itself
    var tok = new jwt.JWT();
    tok.parse(bundle.assertion);


    // Check for parts of the assertion
    equal(tok.audience, testOrigin, "correct audience");
    var expires = tok.expires.getTime();
    ok(typeof expires === "number" && !isNaN(expires), "expiration date is valid");

    // this should be based on server time, not local time.
    network.serverTime(function(time) {
      var nowPlus2Mins = time.getTime() + (2 * 60 * 1000);

      // expiration date must be within 5 seconds of 2 minutes from now - see
      // issue 433 (https://github.com/mozilla/browserid/issues/433)
      var diff = Math.abs(expires - nowPlus2Mins);
      ok(diff < 5000, "expiration date must be within 5 seconds of 2 minutes from now: " + diff);

      equal(typeof tok.cryptoSegment, "string", "cryptoSegment exists");
      equal(typeof tok.headerSegment, "string", "headerSegment exists");
      equal(typeof tok.payloadSegment, "string", "payloadSegment exists");

      if(cb) cb();
    });
  }

  module("shared/user", {
    setup: function() {
      testHelpers.setup();
    },
    teardown: function() {
      testHelpers.teardown();
    }
  });

  test("setOrigin, getOrigin", function() {
    lib.setOrigin(testOrigin);
    equal(lib.getOrigin(), testOrigin);
  });

  test("setOrigin, getHostname", function() {
    var origin = "http://browserid.org";
    lib.setOrigin(origin);

    var hostname = lib.getHostname();
    equal(hostname, "browserid.org", "getHostname returns only the hostname");
  });

  test("getStoredEmailKeypairs without key - return all identities", function() {
    var identities = lib.getStoredEmailKeypairs();
    equal("object", typeof identities, "object returned");
  });

  test("getSortedEmailKeypairs - return array sorted by address", function() {
    storage.addEmail("third", {});
    storage.addEmail("second", {});
    storage.addEmail("first", {});

    var sortedIdentities = lib.getSortedEmailKeypairs();

    equal(sortedIdentities[0].address, "first", "correct first address");
    equal(sortedIdentities[2].address, "third", "correct third address");
  });

  asyncTest("getStoredEmailKeypair with known key - return identity", function() {
    lib.syncEmailKeypair("testuser@testuser.com", function() {
      var identity = lib.getStoredEmailKeypair("testuser@testuser.com");

      ok(identity, "we have an identity");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  test("getStoredEmailKeypair with unknown key", function() {
    var identity = lib.getStoredEmailKeypair("testuser@testuser.com");

    equal(typeof identity, "undefined", "identity is undefined for unknown key");
  });

  test("clearStoredEmailKeypairs", function() {
    lib.clearStoredEmailKeypairs();
    var identities = lib.getStoredEmailKeypairs();
    var count = 0;
    for(var key in identities) {
      if(identities.hasOwnProperty(key)) {
        count++;
      }
    }

    equal(0, count, "after clearing, there are no identities");
  });

  asyncTest("createSecondaryUser success - callback with true status", function() {
    lib.createSecondaryUser("testuser@testuser.com", "password", function(status) {
      ok(status, "user created");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("createSecondaryUser throttled - callback with false status", function() {
    xhr.useResult("throttle");

    lib.createSecondaryUser("testuser@testuser.com", "password", function(status) {
      equal(status, false, "user creation refused");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("createSecondaryUser with XHR failure", function() {
    failureCheck(lib.createSecondaryUser, "testuser@testuser.com", "password");
  });


  asyncTest("createUser with unknown secondary happy case - expect 'secondary.verify'", function() {
    xhr.useResult("unknown_secondary");

    lib.createUser("unregistered@testuser.com", function(status) {
      equal(status, "secondary.verify", "secondary user must be verified");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("createUser with unknown secondary, throttled - expect status='secondary.could_not_add'", function() {
    xhr.useResult("throttle");

    lib.createUser("unregistered@testuser.com", function(status) {
      equal(status, "secondary.could_not_add", "user creation refused");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("createUser with unknown secondary, XHR failure - expect failure call", function() {
    failureCheck(lib.createUser, "unregistered@testuser.com");
  });

  asyncTest("createUser with primary, user verified with primary - expect 'primary.verified'", function() {
    xhr.useResult("primary");
    provisioning.setStatus(provisioning.AUTHENTICATED);

    lib.createUser("unregistered@testuser.com", function(status) {
      equal(status, "primary.verified", "primary user is already verified, correct status");
      network.checkAuth(function(authenticated) {
        equal(authenticated, "assertion", "after provisioning user, user should be automatically authenticated to BrowserID");
        start();
      });
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("createUser with primary, user must authenticate with primary - expect 'primary.verify'", function() {
    xhr.useResult("primary");

    lib.createUser("unregistered@testuser.com", function(status) {
      equal(status, "primary.verify", "primary must verify with primary, correct status");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("createUser with primary, unknown provisioning failure, expect XHR failure callback", function() {
    xhr.useResult("primary");
    provisioning.setFailure({
      code: "primaryError",
      msg: "some error"
    });

    lib.createUser("unregistered@testuser.com",
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("createUserWithInfo", function() {
    ok(true, "For development speed and reduced duplication of tests, tested via createUser");
    start();
  });

  asyncTest("provisionPrimaryUser authenticated with IdP, expect primary.verified", function() {
    xhr.useResult("primary");
    provisioning.setStatus(provisioning.AUTHENTICATED);

    lib.provisionPrimaryUser("unregistered@testuser.com", {},
      function(status, info) {
        equal(status, "primary.verified", "primary user is already verified, correct status");
        start();
      },
      testHelpers.unexpectedXHRFailure
    );
  });

  asyncTest("provisionPrimaryUser not authenticated with IdP, expect primary.verify", function() {
    xhr.useResult("primary");
    provisioning.setStatus(provisioning.NOT_AUTHENTICATED);

    lib.provisionPrimaryUser("unregistered@testuser.com", {},
      function(status, info) {
        equal(status, "primary.verify", "primary user is not verified, correct status");
        start();
      },
      testHelpers.unexpectedXHRFailure
    );
  });

  asyncTest("provisionPrimaryUser with provisioning failure - call failure", function() {
    xhr.useResult("primary");
    provisioning.setFailure("failure");

    lib.provisionPrimaryUser("unregistered@testuser.com", {},
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("primaryUserAuthenticationInfo, user authenticated to IdP, expect keypair, cert, authenticated status", function() {
    provisioning.setStatus(provisioning.AUTHENTICATED);

    lib.primaryUserAuthenticationInfo("testuser@testuser.com", {},
      function(info) {
        equal(info.authenticated, true, "user is authenticated");
        ok(info.keypair, "keypair passed");
        ok(info.cert, "cert passed");
        start();
      },
      testHelpers.unexpectedXHRError
    );
  });

  asyncTest("primaryUserAuthenticationInfo, user not authenticated to IdP, expect false authenticated status", function() {
    provisioning.setStatus(provisioning.NOT_AUTHENTICATED);

    lib.primaryUserAuthenticationInfo("testuser@testuser.com", {},
      function(info) {
        equal(info.authenticated, false, "user is not authenticated");
        start();
      },
      testHelpers.unexpectedXHRError
    );
  });

  asyncTest("primaryUserAuthenticationInfo with XHR failure", function() {
    provisioning.setFailure("failure");

    lib.primaryUserAuthenticationInfo(
      "testuser@testuser.com",
      {},
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("isUserAuthenticatedToPrimary with authed user, expect true status", function() {
    provisioning.setStatus(provisioning.AUTHENTICATED);

    lib.isUserAuthenticatedToPrimary("testuser@testuser.com", {},
      function(status) {
        equal(status, true, "user is authenticated, correct status");
        start();
      },
      testHelpers.unexpectedXHRError
    );
  });

  asyncTest("isUserAuthenticatedToPrimary with non-authed user, expect false status", function() {
    provisioning.setStatus(provisioning.NOT_AUTHENTICATED);

    lib.isUserAuthenticatedToPrimary("testuser@testuser.com", {},
      function(status) {
        equal(status, false, "user is not authenticated, correct status");
        start();
      },
      testHelpers.unexpectedXHRError
    );
  });

  asyncTest("isUserAuthenticatedToPrimary with failure", function() {
    provisioning.setFailure("failure");

    lib.isUserAuthenticatedToPrimary("testuser@testuser.com", {},
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("waitForUserValidation with `complete` response", function() {
    storage.setStagedOnBehalfOf(testOrigin);

    xhr.useResult("complete");

    lib.waitForUserValidation("registered@testuser.com", function(status) {
      equal(status, "complete", "complete response expected");

      ok(!storage.getStagedOnBehalfOf(), "staged on behalf of is cleared when validation completes");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("waitForUserValidation with `mustAuth` response", function() {
    storage.setStagedOnBehalfOf(testOrigin);

    xhr.useResult("mustAuth");

    lib.waitForUserValidation("registered@testuser.com", function(status) {
      equal(status, "mustAuth", "mustAuth response expected");

      ok(!storage.getStagedOnBehalfOf(), "staged on behalf of is cleared when validation completes");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("waitForUserValidation with `noRegistration` response", function() {
    xhr.useResult("noRegistration");

    storage.setStagedOnBehalfOf(testOrigin);
    lib.waitForUserValidation(
      "registered@testuser.com",
      testHelpers.unexpectedSuccess,
      function(status) {
        ok(storage.getStagedOnBehalfOf(), "staged on behalf of is not cleared for noRegistration response");
        ok(status, "noRegistration", "noRegistration response causes failure");
        start();
      }
    );
  });


  asyncTest("waitForUserValidation with XHR failure", function() {
    storage.setStagedOnBehalfOf(testOrigin);
    lib.waitForUserValidation(
      "registered@testuser.com",
      testHelpers.unexpectedSuccess,
      function() {
        ok(storage.getStagedOnBehalfOf(), "staged on behalf of is not cleared on XHR failure");
        ok(true, "xhr failure should always be a failure");
        start();
      }
    );
  });

  asyncTest("cancelUserValidation: ~1 second", function() {
    xhr.useResult("pending");

    storage.setStagedOnBehalfOf(testOrigin);
    // yes, we are neither expected succes nor failure because we are
    // cancelling the wait.
    lib.waitForUserValidation(
      "registered@testuser.com",
      testHelpers.unexpectedSuccess,
      testHelpers.unexpectedXHRFailure
    );

    setTimeout(function() {
      lib.cancelUserValidation();
      ok(storage.getStagedOnBehalfOf(), "staged on behalf of is not cleared when validation cancelled");
      start();
    }, 500);
  });

  asyncTest("tokenInfo with a good token and origin info, expect origin in results", function() {
    storage.setStagedOnBehalfOf(testOrigin);

    lib.tokenInfo("token", function(info) {
      equal(info.email, "testuser@testuser.com", "correct email");
      equal(info.origin, testOrigin, "correct origin");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("tokenInfo with a bad token without site info, no site in results", function() {
    lib.tokenInfo("token", function(info) {
      equal(info.email, "testuser@testuser.com", "correct email");
      equal(typeof info.origin, "undefined", "origin is undefined");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("tokenInfo with XHR error", function() {
    failureCheck(lib.tokenInfo, "token");
  });

  asyncTest("verifyUser with a good token", function() {
    storage.setStagedOnBehalfOf(testOrigin);

    lib.verifyUser("token", "password", function onSuccess(info) {

      ok(info.valid, "token was valid");
      equal(info.email, "testuser@testuser.com", "email part of info");
      equal(info.origin, testOrigin, "origin in info");
      equal(storage.getStagedOnBehalfOf(), "", "initiating origin was removed");

      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("verifyUser with a bad token", function() {
    xhr.useResult("invalid");

    lib.verifyUser("token", "password", function onSuccess(info) {
      equal(info.valid, false, "bad token calls onSuccess with a false validity");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("verifyUser with an XHR failure", function() {
    xhr.useResult("ajaxError");

    lib.verifyUser(
      "token",
      "password",
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("canSetPassword with only primary addresses - expect false", function() {
    storage.addEmail("testuser@testuser.com", { type: "primary" });

    lib.canSetPassword(function(status) {
      equal(false, status, "status is false with user with only primaries");
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("canSetPassword with secondary addresses - expect true", function() {
    storage.addEmail("testuser@testuser.com", { type: "secondary" });

    lib.canSetPassword(function(status) {
      equal(true, status, "status is true with user with secondaries");
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("setPassword with XHR failure", function() {
    xhr.useResult("ajaxError");

    lib.setPassword(
      "password",
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("setPassword success", function() {
    lib.setPassword(
      "password",
      function(status) {
        ok(status, true, "status is true for success");
        start();
      },
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("requestPasswordReset with known email", function() {
    lib.requestPasswordReset("registered@testuser.com", function(status) {
      equal(status.success, true, "password reset for known user");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("requestPasswordReset with unknown email", function() {
    lib.requestPasswordReset("unregistered@testuser.com", function(status) {
      equal(status.success, false, "password not reset for unknown user");
      equal(status.reason, "invalid_user", "invalid_user is the reason");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("requestPasswordReset with throttle", function() {
    xhr.useResult("throttle");
    lib.requestPasswordReset("registered@testuser.com", function(status) {
      equal(status.success, false, "password not reset for throttle");
      equal(status.reason, "throttle", "password reset was throttled");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("requestPasswordReset with XHR failure", function() {
    failureCheck(lib.requestPasswordReset, "registered@testuser.com");
  });


  asyncTest("authenticate with valid credentials, also syncs email with server", function() {
    lib.authenticate("testuser@testuser.com", "testuser", function(authenticated) {
      equal(true, authenticated, "we are authenticated!");
      var emails = lib.getStoredEmailKeypairs();
      equal(_.size(emails) > 0, true, "emails have been synced to server");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });


  asyncTest("authenticate with invalid credentials", function() {
    xhr.useResult("invalid");
    lib.authenticate("testuser@testuser.com", "testuser", function onComplete(authenticated) {
      equal(false, authenticated, "invalid authentication.");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });


  asyncTest("authenticate with XHR failure", function() {
    failureCheck(lib.authenticate, "testuser@testuser.com", "testuser");
  });


  asyncTest("checkAuthentication with valid authentication", function() {
    xhr.setContextInfo("auth_level", "primary");
    lib.checkAuthentication(function(authenticated) {
      equal(authenticated, "primary", "We are authenticated!");
      start();
    });
  });



  asyncTest("checkAuthentication with invalid authentication", function() {
    xhr.setContextInfo("auth_level", undefined);
    lib.checkAuthentication(function(authenticated) {
      equal(authenticated, undefined, "We are not authenticated!");
      start();
    });
  });



  asyncTest("checkAuthentication with XHR failure", function() {
    xhr.useResult("contextAjaxError");
    failureCheck(lib.checkAuthentication);
  });



  asyncTest("checkAuthenticationAndSync with valid authentication", function() {
    xhr.setContextInfo("auth_level", "primary");

    lib.checkAuthenticationAndSync(function(authenticated) {
      equal(authenticated, "primary", "We are authenticated!");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });



  asyncTest("checkAuthenticationAndSync with invalid authentication", function() {
    xhr.setContextInfo("auth_level", undefined);

    lib.checkAuthenticationAndSync(function onComplete(authenticated) {
      equal(authenticated, undefined, "We are not authenticated!");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });


  asyncTest("checkAuthenticationAndSync with XHR failure", function() {
    xhr.setContextInfo("auth_level", "primary");

    failureCheck(lib.checkAuthenticationAndSync);
  });

  asyncTest("isEmailRegistered with registered email", function() {
    lib.isEmailRegistered("registered@testuser.com", function(registered) {
      ok(registered);
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("isEmailRegistered with unregistered email", function() {
    lib.isEmailRegistered("unregistered@testuser.com", function(registered) {
      equal(registered, false);
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("isEmailRegistered with XHR failure", function() {
    failureCheck(lib.isEmailRegistered, "registered");
  });

  asyncTest("addEmail", function() {
    lib.addEmail("testemail@testemail.com", function(added) {
      ok(added, "user was added");

      var identities = lib.getStoredEmailKeypairs();
      equal(false, "testemail@testemail.com" in identities, "Our new email is not added until confirmation.");

      equal(storage.getStagedOnBehalfOf(), lib.getHostname(), "initiatingOrigin is stored");

      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("addEmail with addition refused", function() {
    xhr.useResult("throttle");

    lib.addEmail("testemail@testemail.com", function(added) {
      equal(added, false, "user addition was refused");

      var identities = lib.getStoredEmailKeypairs();
      equal(false, "testemail@testemail.com" in identities, "Our new email is not added until confirmation.");

      equal(typeof storage.getStagedOnBehalfOf(), "undefined", "initiatingOrigin is not stored");

      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("addEmail with XHR failure", function() {
    failureCheck(lib.addEmail, "testemail@testemail.com");
  });


 asyncTest("waitForEmailValidation `complete` response", function() {
    storage.setStagedOnBehalfOf(testOrigin);

    xhr.useResult("complete");
    lib.waitForEmailValidation("registered@testuser.com", function(status) {
      ok(!storage.getStagedOnBehalfOf(), "staged on behalf of is cleared when validation completes");
      equal(status, "complete", "complete response expected");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("waitForEmailValidation `mustAuth` response", function() {
    storage.setStagedOnBehalfOf(testOrigin);
    xhr.useResult("mustAuth");

    lib.waitForEmailValidation("registered@testuser.com", function(status) {
      ok(!storage.getStagedOnBehalfOf(), "staged on behalf of is cleared when validation completes");
      equal(status, "mustAuth", "mustAuth response expected");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("waitForEmailValidation with `noRegistration` response", function() {
    storage.setStagedOnBehalfOf(testOrigin);
    xhr.useResult("noRegistration");

    lib.waitForEmailValidation(
      "registered@testuser.com",
      testHelpers.unexpectedSuccess,
      function(status) {
        ok(storage.getStagedOnBehalfOf(), "staged on behalf of is cleared when validation completes");
        ok(status, "noRegistration", "noRegistration response causes failure");
        start();
      });
  });


 asyncTest("waitForEmailValidation XHR failure", function() {
    storage.setStagedOnBehalfOf(testOrigin);
    xhr.useResult("ajaxError");

    lib.waitForEmailValidation(
      "registered@testuser.com",
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });


  asyncTest("cancelEmailValidation: ~1 second", function() {
    xhr.useResult("pending");

    storage.setStagedOnBehalfOf(testOrigin);
    lib.waitForEmailValidation(
      "registered@testuser.com",
      testHelpers.unexpectedSuccess,
      testHelpers.unexpectedXHRFailure
    );

    setTimeout(function() {
      lib.cancelUserValidation();
      ok(storage.getStagedOnBehalfOf(), "staged on behalf of is not cleared when validation cancelled");
      start();
    }, 500);
  });

  asyncTest("verifyEmailNoPassword with a good token - callback with email, orgiin, and valid", function() {
    storage.setStagedOnBehalfOf(testOrigin);
    lib.verifyEmailNoPassword("token", function onSuccess(info) {

      ok(info.valid, "token was valid");
      equal(info.email, "testuser@testuser.com", "email part of info");
      equal(info.origin, testOrigin, "origin in info");
      equal(storage.getStagedOnBehalfOf(), "", "initiating origin was removed");

      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("verifyEmailNoPassword with a bad token - callback with valid: false", function() {
    xhr.useResult("invalid");

    lib.verifyEmailNoPassword("token", function onSuccess(info) {
      equal(info.valid, false, "bad token calls onSuccess with a false validity");

      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("verifyEmailNoPassword with an XHR failure", function() {
    xhr.useResult("ajaxError");

    lib.verifyEmailNoPassword(
      "token",
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("verifyEmailWithPassword with a good token - callback with email, origin, valid", function() {
    storage.setStagedOnBehalfOf(testOrigin);
    lib.verifyEmailWithPassword("token", "password", function onSuccess(info) {

      ok(info.valid, "token was valid");
      equal(info.email, "testuser@testuser.com", "email part of info");
      equal(info.origin, testOrigin, "origin in info");
      equal(storage.getStagedOnBehalfOf(), "", "initiating origin was removed");

      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("verifyEmailWithPassword with a bad token - callback with valid: false", function() {
    xhr.useResult("invalid");

    lib.verifyEmailWithPassword("token", "password", function onSuccess(info) {
      equal(info.valid, false, "bad token calls onSuccess with a false validity");

      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("verifyEmailWithPassword with an XHR failure", function() {
    xhr.useResult("ajaxError");

    lib.verifyEmailWithPassword(
      "token",
      "password",
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("syncEmailKeypair with successful sync", function() {
    lib.syncEmailKeypair("testemail@testemail.com", function(keypair) {
      var identity = lib.getStoredEmailKeypair("testemail@testemail.com");

      ok(identity, "we have an identity");
      ok(identity.priv, "a private key is on the identity");
      ok(identity.pub, "a private key is on the identity");

      start();
    }, testHelpers.unexpectedXHRFailure);
  });


  asyncTest("syncEmailKeypair with invalid sync", function() {
    xhr.useResult("invalid");
    lib.syncEmailKeypair(
      "testemail@testemail.com",
      testHelpers.unexpectedSuccess,
      function() {
        var identity = lib.getStoredEmailKeypair("testemail@testemail.com");
        equal(typeof identity, "undefined", "Invalid email is not synced");

        start();
      }
    );
  });

  asyncTest("syncEmailKeypair with XHR failure", function() {
    failureCheck(lib.syncEmailKeypair, "testemail@testemail.com");
  });


  asyncTest("removeEmail that is added", function() {
    storage.addEmail("testemail@testemail.com", {pub: "pub", priv: "priv"});

    lib.removeEmail("testemail@testemail.com", function() {
      var identities = lib.getStoredEmailKeypairs();
      equal(false, "testemail@testemail.com" in identities, "Our new email is removed");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });



  asyncTest("removeEmail that is not added", function() {
    lib.removeEmail("testemail@testemail.com", function() {
      var identities = lib.getStoredEmailKeypairs();
      equal(false, "testemail@testemail.com" in identities, "Our new email is removed");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("removeEmail with XHR failure", function() {
    storage.addEmail("testemail@testemail.com", {pub: "pub", priv: "priv"});

    failureCheck(lib.removeEmail, "testemail@testemail.com");
  });




  asyncTest("syncEmails with no pre-loaded identities and no identities to add", function() {
    xhr.useResult("no_identities");
    lib.syncEmails(function onSuccess() {
      var identities = lib.getStoredEmailKeypairs();
      ok(true, "we have synced identities");
      equal(_.size(identities), 0, "there are no identities");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("syncEmails with no pre-loaded identities and identities to add", function() {
    lib.syncEmails(function onSuccess() {
      var identities = lib.getStoredEmailKeypairs();
      ok("testuser@testuser.com" in identities, "Our new email is added");
      equal(_.size(identities), 1, "there is one identity");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("syncEmails with identities preloaded and none to add", function() {
    storage.addEmail("testuser@testuser.com", {});
    lib.syncEmails(function onSuccess() {
      var identities = lib.getStoredEmailKeypairs();
      ok("testuser@testuser.com" in identities, "Our new email is added");
      equal(_.size(identities), 1, "there is one identity");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });


  asyncTest("syncEmails with identities preloaded and one to add", function() {
    storage.addEmail("testuser@testuser.com", {pubkey: pubkey, cert: random_cert});

    xhr.useResult("multiple");

    lib.syncEmails(function onSuccess() {
      var identities = lib.getStoredEmailKeypairs();
      ok("testuser@testuser.com" in identities, "Our old email address is still there");
      ok("testuser2@testuser.com" in identities, "Our new email is added");
      equal(_.size(identities), 2, "there are two identities");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });


  asyncTest("syncEmails with identities preloaded and one to remove", function() {
    storage.addEmail("testuser@testuser.com", {pub: pubkey, cert: random_cert});
    storage.addEmail("testuser2@testuser.com", {pub: pubkey, cert: random_cert});

    lib.syncEmails(function onSuccess() {
      var identities = lib.getStoredEmailKeypairs();
      ok("testuser@testuser.com" in identities, "Our old email address is still there");
      equal("testuser2@testuser.com" in identities, false, "Our unknown email is removed");
      equal(_.size(identities), 1, "there is one identity");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("syncEmails with one to refresh", function() {
    storage.addEmail("testuser@testuser.com", {pub: pubkey, cert: random_cert});

    lib.syncEmails(function onSuccess() {
      var identities = lib.getStoredEmailKeypairs();
      ok("testuser@testuser.com" in identities, "refreshed key is synced");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("syncEmails with XHR failure", function() {
    failureCheck(lib.syncEmails);
  });

  asyncTest("getAssertion with known email that has key", function() {
    lib.syncEmailKeypair("testuser@testuser.com", function() {
      lib.getAssertion("testuser@testuser.com", lib.getOrigin(), function onSuccess(assertion) {
        testAssertion(assertion, start);
        equal(storage.site.get(testOrigin, "email"), "testuser@testuser.com", "email address was persisted");
      }, testHelpers.unexpectedXHRFailure);
    }, testHelpers.unexpectedXHRFailure);
  });


  asyncTest("getAssertion with known secondary email that does not have a key", function() {
    storage.addEmail("testuser@testuser.com", { type: "secondary" });
    lib.getAssertion("testuser@testuser.com", lib.getOrigin(), function onSuccess(assertion) {
      testAssertion(assertion, start);
      equal(storage.site.get(testOrigin, "email"), "testuser@testuser.com", "email address was persisted");
    }, testHelpers.unexpectedXHRFailure);
  });


  asyncTest("getAssertion with known primary email, expired cert, user authenticated with IdP - expect assertion", function() {
    xhr.useResult("primary");
    provisioning.setStatus(provisioning.AUTHENTICATED);
    storage.addEmail("unregistered@testuser.com", { type: "primary" });

    lib.getAssertion(
      "unregistered@testuser.com",
      lib.getOrigin(),
      function(assertion) {
        testAssertion(assertion, start);
        equal(storage.site.get(testOrigin, "email"), "unregistered@testuser.com", "email address was persisted");
      },
      testHelpers.unexpectedXHRFailure);
  });

  asyncTest("getAssertion with known primary email, expired cert, user authenticated with IdP - expect null assertion", function() {
    xhr.useResult("primary");
    provisioning.setStatus(provisioning.NOT_AUTHENTICATED);
    storage.addEmail("unregistered@testuser.com", { type: "primary" });

    lib.getAssertion(
      "unregistered@testuser.com",
      lib.getOrigin(),
      function(assertion) {
        equal(assertion, null, "user must authenticate with IdP, no assertion");
        start();
      },
      testHelpers.unexpectedXHRFailure);
  });

  asyncTest("getAssertion with unknown email", function() {
    lib.syncEmailKeypair("testuser@testuser.com", function() {
      lib.getAssertion("testuser2@testuser.com", lib.getOrigin(), function onSuccess(assertion) {
        equal(null, assertion, "email was unknown, we do not have an assertion");
        equal(storage.site.get(testOrigin, "email"), undefined, "email address was not set");
        start();
      });
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("getAssertion with XHR failure", function() {
    storage.addEmail("testuser@testuser.com", {});
    failureCheck(lib.getAssertion, "testuser@testuser.com", lib.getOrigin());
  });


  asyncTest("logoutUser", function(onSuccess) {
    lib.authenticate("testuser@testuser.com", "testuser", function(authenticated) {
      lib.syncEmails(function() {
        var storedIdentities = storage.getEmails();
        equal(_.size(storedIdentities), 1, "one identity");

        lib.logoutUser(function() {
          storedIdentities = storage.getEmails();
          equal(_.size(storedIdentities), 0, "All items have been removed on logout");

          start();
        }, testHelpers.unexpectedXHRFailure);
      }, testHelpers.unexpectedXHRFailure);
    }, testHelpers.unexpectedXHRFailure);


  });

  asyncTest("logoutUser with XHR failure", function(onSuccess) {
    lib.authenticate("testuser@testuser.com", "testuser", function(authenticated) {
      lib.syncEmails(function() {
        failureCheck(lib.logoutUser);
      }, testHelpers.unexpectedXHRFailure);
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("cancelUser", function(onSuccess) {
    lib.cancelUser(function() {
      var storedIdentities = storage.getEmails();
      equal(_.size(storedIdentities), 0, "All items have been removed");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("cancelUser with XHR failure", function(onSuccess) {
    failureCheck(lib.cancelUser);
  });


  asyncTest("logout with invalid login", function() {
    xhr.setContextInfo("auth_level", undefined);

    lib.logout(function onComplete(success) {
      strictEqual(success, false, "success with invalid login is false");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("logout with valid login with remember set to true", function() {
    xhr.setContextInfo("auth_level", "primary");
    storage.site.set(testOrigin, "remember", true);

    lib.logout(function onComplete(success) {
      strictEqual(success, true, "success flag good");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("addressInfo with XHR Error", function() {
    failureCheck(lib.addressInfo, "testuser@testuser.com");
  });

  asyncTest("addressInfo with unknown secondary user", function() {
    xhr.useResult("unknown_secondary");
    lib.addressInfo(
      "unregistered@testuser.com",
      function(info) {
        equal(info.email, "unregistered@testuser.com", "correct address");
        equal(info.type, "secondary", "correct type");
        equal(info.email, "unregistered@testuser.com", "correct email");
        equal(info.known, false, "address not known to BrowserID");
        start();
      },
      testHelpers.unexpectedFailure
    );
  });

  asyncTest("addressInfo with known secondary user", function() {
    xhr.useResult("known_secondary");
    lib.addressInfo(
      "registered@testuser.com",
      function(info) {
        equal(info.type, "secondary", "correct type");
        equal(info.email, "registered@testuser.com", "correct email");
        equal(info.known, true, "address known to BrowserID");
        start();
      },
      testHelpers.unexpectedFailure
    );
  });

  asyncTest("addressInfo with primary authenticated user", function() {
    xhr.useResult("primary");
    provisioning.setStatus(provisioning.AUTHENTICATED);
    lib.addressInfo(
      "registered@testuser.com",
      function(info) {
        equal(info.type, "primary", "correct type");
        equal(info.email, "registered@testuser.com", "correct email");
        equal(info.authed, true, "user is authenticated with IdP");
        start();
      },
      testHelpers.unexpectedFailure
    );
  });

  asyncTest("addressInfo with primary unauthenticated user", function() {
    xhr.useResult("primary");
    provisioning.setStatus(provisioning.NOT_AUTHENTICATED);
    lib.addressInfo(
      "registered@testuser.com",
      function(info) {
        equal(info.type, "primary", "correct type");
        equal(info.email, "registered@testuser.com", "correct email");
        equal(info.authed, false, "user is not authenticated with IdP");
        start();
      },
      testHelpers.unexpectedFailure
    );
  });

  asyncTest("hasSecondary returns false if the user has 0 secondary email address", function() {
    lib.hasSecondary(function(hasSecondary) {
      equal(hasSecondary, false, "hasSecondary is false");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("hasSecondary returns true if the user has at least one secondary email address", function() {
    storage.addEmail("testuser@testuser.com", { type: "secondary" });
    lib.hasSecondary(function(hasSecondary) {
      equal(hasSecondary, true, "hasSecondary is true");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("setComputerOwnershipStatus with true, isUsersComputer - mark the computer as the users, prolongs the user's session", function() {
    lib.authenticate("testuser@testuser.com", "password", function() {
      storage.usersComputer.clear(network.userid());
      lib.setComputerOwnershipStatus(true, function() {
        lib.isUsersComputer(function(usersComputer) {
          equal(usersComputer, true, "user is marked as owner of computer");
          start();
        }, testHelpers.unexpectedXHRFailure);
      }, testHelpers.unexpectedXHRFailure);
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("setComputerOwnershipStatus with false, isUsersComputer - mark the computer as not the users", function() {
    lib.authenticate("testuser@testuser.com", "password", function() {
      storage.usersComputer.clear(network.userid());
      lib.setComputerOwnershipStatus(false, function() {
        lib.isUsersComputer(function(usersComputer) {
          equal(usersComputer, false, "user is marked as not an owner");
          start();
        }, testHelpers.unexpectedXHRFailure);
      }, testHelpers.unexpectedXHRFailure);
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("setComputerOwnershipStatus with unauthenticated user - call onFailure", function() {
    lib.setComputerOwnershipStatus(false,
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure
    );
  });

  asyncTest("setComputerOwnershipStatus with true & XHR Failure - call onFailure", function() {
    lib.authenticate("testuser@testuser.com", "password", function() {
      xhr.useResult("ajaxError");
      lib.setComputerOwnershipStatus(true,
        testHelpers.unexpectedSuccess,
        testHelpers.expectedXHRFailure
      );
    }, testHelpers.unexpectedXHRFailure);
  });

}());
