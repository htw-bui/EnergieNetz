/** 
 * @module Module for managing user accounts
 * @requires system
 * @requires appsecurity
 * @requires errorHandler
 * @requires logger
*/

define([
    'durandal/system',
    'services/appsecurity',
    'services/errorhandler',
    'services/logger',
    'services/utils',
    'durandal/app',
    'plugins/router'
  ],
  function(system, appsecurity, errorhandler, logger, utils, app, router) {

    var self = this,
        externalAccessToken,
        externalError;

    function AddExternalLoginProviderViewModel(data) {
      var self = this;

      // Data
      self.name = ko.observable(data.name);

      // Operations
      self.login = function() {
        sessionStorage["state"] = data.state;
        sessionStorage["associatingExternalLogin"] = true;
        // IE doesn't reliably persist sessionStorage when navigating to another URL. Move sessionStorage temporarily
        // to localStorage to work around this problem.
        appsecurity.archiveSessionStorageToLocalStorage();
        window.location = data.url;
      };

      self.socialIcon = function(provider) {
        var icon = "";
        switch (provider.name().toLowerCase()) {
          case "facebook":
            icon = "fa fa-facebook-square";
            break;
          case "twitter":
            icon = "fa fa-twitter-square";
            break;
          case "google":
            icon = "fa fa-google-plus-square";
            break;
          case "microsoft":
            icon = "fa fa-envelope";
            break;
          default:
            icon = "fa fa-check-square";
        }
        return icon;
      };
    }

    function UserManageViewModel() {

      var self = this;
      self.firstName = ko.observable().extend({ required: true });
      self.lastName = ko.observable().extend({ required: true });
      self.email = ko.observable().extend({ required: true, email: true });
      self.phoneNumber = ko.observable().extend({});
      appsecurity.getUserManage().done(function(data) {
        self.firstName(data.firstName);
        self.lastName(data.lastName);
        self.email(data.email);
        self.phoneNumber(data.phoneNumber);

      });
      self.validationErrors = ko.validation.group([self.firstName, self.lastName, self.email, self.phoneNumber]);

      errorhandler.includeIn(self);

      self.save = function() {
        if (self.validationErrors().length > 0) {
          self.validationErrors.showAllMessages();
          return;
        }
        appsecurity.changeUserData({
          firstName: self.firstName(),
          lastName: self.lastName(),
          email: self.email(),
          phoneNumber: self.phoneNumber(),
        }).done(function(data) {
          logger.logSuccess(language.getValue('save_successMessage'), null, null, true);
        }).fail(self.handlevalidationerrors);
      };
    }

    function ChangePasswordViewModel(name) {
      var self = this;

      // Data
      self.name = ko.observable(name);
      self.oldPassword = ko.observable("").extend({ required: true });
      self.newPassword = ko.observable("").extend({ required: true });
      self.confirmPassword = ko.observable("").extend({ required: true, equal: self.newPassword });


      // Other UI state
      self.changing = ko.observable(false);
      self.validationErrors = ko.validation.group([self.oldPassword, self.newPassword, self.confirmPassword]);

      errorhandler.includeIn(self);

      // Operations
      self.change = function() {
        if (self.validationErrors().length > 0) {
          self.validationErrors.showAllMessages();
          return;
        }
        self.changing(true);

        appsecurity.changePassword({
            oldPassword: self.oldPassword(),
            newPassword: self.newPassword(),
            confirmPassword: self.confirmPassword()
          }).done(function(data) {
            self.changing(false);
            reset();
            logger.logSuccess(language.getValue('passwordChanged_successMessage'), null, null, true);
          })
          .fail(self.handlevalidationerrors)
          .fail(function() {
            self.changing(false);
          });
      };
    }

    function RemoveLoginViewModel(data, userLogins) {
      // Private state
      var self = this,
          providerKey = ko.observable(data.providerKey);

      // Data
      self.loginProvider = ko.observable(data.loginProvider);

      // Other UI state
      self.removing = ko.observable(false);

      errorhandler.includeIn(self);

      // Operations
      self.remove = function() {
        var self = this;
        self.removing(true);
        appsecurity.removeLogin({
            loginProvider: self.loginProvider(),
            providerKey: providerKey()
          }).done(function(data) {
            self.removing(false);
            userLogins.remove(self);
            logger.logSuccess(language.getValue('loginRemoved_successMessage'), null, null, true);
          })
          .fail(self.handlevalidationerrors)
          .fail(function() {
            self.removing(false);
          });
      };
    }

    function SetPasswordViewModel(userLogins, localLoginProvider, userName) {
      var self = this;

      // Data
      self.newPassword = ko.observable("").extend({ required: true });
      self.confirmPassword = ko.observable("").extend({ required: true, equal: self.newPassword });

      // Other UI state
      self.setting = ko.observable(false);
      self.validationErrors = ko.validation.group([self.newPassword, self.confirmPassword]);

      // Operations
      self.set = function() {
        var self = this;
        if (self.validationErrors().length > 0) {
          self.validationErrors.showAllMessages();
          return;
        }
        self.setting(true);

        errorhandler.includeIn(self);

        appsecurity.setPassword({
            newPassword: self.newPassword(),
            confirmPassword: self.confirmPassword()
          }).done(function(data) {
            self.setting(false);
            userLogins.push(new RemoveLoginViewModel({
              loginProvider: localLoginProvider(),
              providerKey: userName()
            }, userLogins));
            logger.logSuccess(language.getValue('setPassword_successMessage'), null, null, true);
          })
          .fail(self.handlevalidationerrors)
          .fail(function() {
            self.setting(false);
          });
      };
    }

    var userName = ko.observable();

    var userLogins = ko.observableArray();
    var externalLoginProviders = ko.observableArray();
    var localLoginProvider = ko.observable();
    var hasLocalPassword = ko.computed(function() {

      var logins = userLogins();

      for (var i = 0; i < logins.length; i++) {
        if (logins[i].loginProvider() === localLoginProvider()) {
          return true;
        }
      }

      return false;
    });

    var hasExternalLogin = ko.computed(function() {
      return externalLoginProviders().length > 0;
    });

    var hasExternalLogin = ko.computed(function() {
      return externalLoginProviders().length > 0;
    });

    var canRemoveLogin = ko.computed(function() {
      return userLogins().length > 1;
    });

    var viewmodel = {

      /** @property {observable} userName */
      userName: userName,

      /** @property {observable} localLoginProvider */
      localLoginProvider: localLoginProvider,

      addExternalLogin: function(externalAccessToken, externalError) {
        var self = this;
        return system.defer(function(dfd) {
          if (externalError !== "null" || externalAccessToken === null) {
            logger.logError(language.getValue('externalLogin_errorMessage'), null, null, true);
            dfd.resolve();
          } else {
            appsecurity.addExternalLogin({
                externalAccessToken: externalAccessToken
              })
              .done(function() {
                dfd.resolve();
              })
              .fail(function(errors) {
                self.handleauthenticationerrors(errors);
                dfd.resolve();
              });
          }
        });
      },

      userLogins: userLogins,

      hasLocalPassword: hasLocalPassword,

      externalLoginProviders: externalLoginProviders,

      loading: ko.observable(true),

      message: ko.observable(),

      changePassword: new ChangePasswordViewModel(userName()),

      userManage: new UserManageViewModel(),

      setPassword: new SetPasswordViewModel(userLogins, localLoginProvider, userName),

      hasExternalLogin: hasExternalLogin,

      canRemoveLogin: canRemoveLogin,

      initialize: function() {
        var self = this;
        appsecurity.getManageInfo(appsecurity.returnUrl, true /* generateState */)
          .done(function(data) {
            if (typeof (data.localLoginProvider) !== "undefined" &&
              typeof (data.userName) !== "undefined" &&
              typeof (data.logins) !== "undefined" &&
              typeof (data.externalLoginProviders) !== "undefined") {

              self.userName(data.userName);

              self.localLoginProvider(data.localLoginProvider);
              self.userLogins.removeAll();

              for (var i = 0; i < data.logins.length; i++) {
                self.userLogins.push(new RemoveLoginViewModel(data.logins[i], self.userLogins));
              }

              self.externalLoginProviders.removeAll();

              for (var i = 0; i < data.externalLoginProviders.length; i++) {
                self.externalLoginProviders.push(new AddExternalLoginProviderViewModel(data.externalLoginProviders[i]));
              }
            } else {
              logger.logError(language.getValue('getAccountInfo_errorMessage'), null, null, true);
            }
            self.loading(false);
          })
          .fail(self.handlevalidationerrors)
          .fail(function() {
            self.loading(false);
          });
      },

      /**
         * Activate view
         * @method
         * @return {promise} - Promise of user having an account
        */
      activate: function() {
        var self = this;
        ga('send', 'pageview', { 'page': window.location.href, 'title': document.title });

        externalAccessToken = utils.getUrlParameter("externalAccessToken");
        externalError = utils.getUrlParameter("externalError");

        if (externalAccessToken !== "null" || externalError !== "null") {
          self.addExternalLogin(externalAccessToken, externalError)
            .done(function() {
              return self.initialize();
            });
        } else {
          return self.initialize();
        }
      },

      /**
         * Delete the user account
         * @method         
        */
      deleteAccount: function() {
        var self = this;

        return app.showMessage(language.getValue('removeAccount_info'), language.getValue('removeAccount_confirmationMessage'), [language.getValue('yes'), language.getValue('no')])
          .then(function(option) {
            if (option === language.getValue('yes')) {
              appsecurity.deleteAccount()
                .done(function() {
                  appsecurity.logout()
                    .done(function() {
                      appsecurity.clearAuthInfo();
                      window.location = "/account/login";
                    })
                    .fail(self.handlevalidationerrors);
                })
                .fail(self.handlevalidationerrors);
            }
          });
      }
    };

    errorhandler.includeIn(viewmodel);

    return viewmodel;

  });