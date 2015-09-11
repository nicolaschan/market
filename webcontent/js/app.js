(function() {
	var app = angular.module('market', ['elements', 'ngRoute']);

	var error_messages = {
		communication_error: 'Communication error with server'
	};

	var global_values = {
		username: '',
		balance: 0,
		taxRate: 0,
		isAdmin: false
	};

	var updaters = {};

	var displayCurrency = function(amount) {
		amount = amount.toLocaleString();
		if (amount.indexOf('.') > -1) {
			var characters_after_dot_length = amount.substring(amount.indexOf('.')).length - 1;
			while (characters_after_dot_length < 2) {
				characters_after_dot_length++;
				amount += '0';
			}
			return '$' + amount;
		} else {
			return '$' + amount.toString() + '.00';
		}
	};

	var current_route;
	app.run(['$rootScope', '$location', '$window', '$routeParams', function($rootScope, $location, $window, $routeParams) {
		$rootScope.$on('$routeChangeSuccess', function(e, current, pre) {
			current_route = $location.path();
		});
	}]);
	app.config(function($routeProvider) {
		$routeProvider
			.when('/', {
				templateUrl: 'static/templates/market-welcome.html'
			})
			.when('/buy', {
				templateUrl: 'static/templates/buy-items.html',
				controller: function($http) {
					var store = this;

					this.search = '';
					this.allItems = [];
					this.items = this.allItems;

					this.quantity = 1;

					this.loaded = false;
					updaters.buy = function() {
						$http.get('/api/buy').then(function(response) {
							store.allItems = response.data;
							store.items = response.data;
							store.loaded = true;
						});
					};
					updaters.buy();

					this.getItems = function() {
						return this.items;
					};
					this.getItemIndex = function(item) {
						return this.items.indexOf(item);
					};
					this.doSearch = function() {
						this.items = [];
						for (var i in this.allItems) {
							var found = true;
							var pieces = this.allItems[i].name.toLowerCase() + ' ' + this.allItems[i].description.toLowerCase() + ' ' + this.allItems[i].owner.toLowerCase() + ' ' + displayCurrency(store.getTotal(this.allItems[i].price));
							var query = this.search.toLowerCase().split(' ');
							for (var j in query) {
								if (!(pieces.includes(query[j]))) {
									found = false;
								}
							}
							if (found) {
								this.items.push(this.allItems[i]);
							}
						}
					};
					this.getTax = function(amount) {
						return Math.ceil(amount * global_values.taxRate * 100) / 100;
					};
					this.getTotal = function(amount) {
						return this.getTax(amount) + amount;
					};
					this.getTotalWithQuantity = function(amount) {
						return this.getTotal(amount) * store.quantity;
					};
					this.enoughFunds = function(price) {
						if (this.getTotal(price) <= global_values.balance) {
							return true;
						} else {
							return false;
						}
					};
					this.getBalanceAfter = function(amount) {
						return global_values.balance - amount;
					};

					this.buy = function(item) {
						$http.post('/api', {
							page: 'buy',
							data: {
								item: item,
								quantity: store.quantity
							}
						}).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = response.data.message;
								updaters.buy();
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
						});
					};
				},
				controllerAs: 'itemsCtrl'
			})
			.when('/items', {
				templateUrl: 'static/templates/my-items.html',
				controller: function($http) {
					var store = this;

					this.search = '';
					this.allItems = [];
					this.items = this.allItems;

					this.loaded = false;
					updaters.items = function() {
						$http.get('/api/items').then(function(response) {
							store.allItems = response.data;
							store.items = response.data;
							store.loaded = true;
						});
					};
					updaters.items();

					this.getItems = function() {
						return this.items;
					};
					this.getItemIndex = function(item) {
						return this.items.indexOf(item);
					};
					this.doSearch = function() {
						this.items = [];
						for (var i in this.allItems) {
							var found = true;
							var pieces = this.allItems[i].name.toLowerCase() + ' ' + this.allItems[i].description.toLowerCase() + ' ' + this.allItems[i].seller.toLowerCase() + ' ' + this.allItems[i].price;
							var query = this.search.toLowerCase().split(' ');
							for (var j in query) {
								if (!(pieces.includes(query[j]))) {
									found = false;
								}
							}
							if (found) {
								this.items.push(this.allItems[i]);
							}
						}
					}

					this.listingItem = {
						name: '',
						description: '',
						price: 0,
						quantity: 1,
						instructions: '',
						image: '',
						forSale: false
					};

					this.errorMessage = '';
					this.successMessage = '';
					this.addItem = function() {
						var listingItemTemp = this.listingItem;
						this.listingItem = {
							name: '',
							description: '',
							price: 0,
							quantity: 1,
							instructions: '',
							image: '',
							forSale: false
						};

						$http.post('/api', {
							page: 'items',
							data: {
								item: listingItemTemp
							}
						}).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = 'Created item';
								updaters.items();
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
								store.listingItem = listingItemTemp;
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
						});
					};
					this.deleteItem = function(itemId) {
						$http.post('/api', {
							page: 'items-delete',
							data: {
								itemId: itemId
							}
						}).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = 'Deleted item';
								updaters.items();
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
						});
					};

					this.editingItem = {};
					this.editItem = function() {
						$http.post('/api', {
							page: 'items-edit',
							data: {
								item: this.editingItem
							}
						}).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = 'Updated item';
								updaters.items();
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
						});
					};
					this.setEditingItem = function(item) {
						this.editingItem = JSON.parse(JSON.stringify(item));
					};
				},
				controllerAs: 'sellItemsCtrl'
			})
			.when('/receipts', {
				templateUrl: 'static/templates/my-receipts.html',
				controller: function($http) {
					var store = this;

					this.search = '';

					this.allReceipts = [];
					this.receipts = this.allReceipts;

					this.loaded = false;
					$http.get('/api/receipts').then(function(response) {
						store.allReceipts = response.data;
						store.receipts = response.data;
						store.loaded = true;
					});

					this.currentReceipt = null;
					this.showModal = function(receipt) {
						this.currentReceipt = receipt;
						$('#receiptInfoModal').modal('show');
					};

					this.isIncoming = function(receipt) {
						if (receipt.buyer.username === global_values.username) {
							return true;
						} else {
							return false;
						}
					};
					this.isOutgoing = function(receipt) {
						if (receipt.seller.username === global_values.username) {
							return true;
						} else {
							return false;
						}
					};

					this.doSearch = function() {
						this.receipts = [];
						for (var i in this.allReceipts) {
							var found = true;
							var pieces = this.allReceipts[i].item.name.toLowerCase() + ' ' + this.allReceipts[i].date.toLowerCase() + ' ' + this.allReceipts[i].item.quantity.toString().toLowerCase() + ' ' + this.allReceipts[i].proof.toString().toLowerCase();
							if (this.isIncoming(this.allReceipts[i])) {
								pieces += ' ' + 'purchases' + ' ' + this.allReceipts[i].seller.username.toLowerCase() + ' #' + this.allReceipts[i].seller.bankid.toLowerCase();
							} else {
								pieces += ' ' + 'sales' + ' ' + this.allReceipts[i].buyer.username.toLowerCase() + ' #' + this.allReceipts[i].buyer.bankid.toLowerCase();
							}
							var query = this.search.toLowerCase().split(' ');

							for (var j in query) {
								if (!(pieces.includes(query[j]))) {
									found = false;
								}
							}
							if (found) {
								this.receipts.push(this.allReceipts[i]);
							}
						}
					};

					this.getIncomingReceipts = function() {
						var output = [];
						for (var i in this.receipts) {
							if (this.isIncoming(this.receipts[i])) {
								output.push(this.receipts[i]);
							}
						}
						return output;
					};
					this.getOutgoingReceipts = function() {
						var output = [];
						for (var i in this.receipts) {
							if (this.isOutgoing(this.receipts[i])) {
								output.push(this.receipts[i]);
							}
						}
						return output;
					};
				},
				controllerAs: 'receiptsCtrl'
			})
			.when('/balance', {
				templateUrl: 'static/templates/balance-tab.html'
			})
			.when('/transactions', {
				templateUrl: 'static/templates/transactions-tab.html',
				controller: function($http) {
					var store = this;

					this.search = '';

					this.allTransactions = [];
					this.transactions = this.allTransactions;

					this.loaded = false;
					$http.get('/api/transactions').then(function(response) {
						store.allTransactions = response.data;
						store.transactions = response.data;
						store.loaded = true;
					});

					this.isIncoming = function(transaction) {
						if (transaction.to.username === global_values.username) {
							return true;
						} else {
							return false;
						}
					};
					this.isOutgoing = function(transaction) {
						if (transaction.from.username === global_values.username) {
							return true;
						} else {
							return false;
						}
					};

					this.doSearch = function() {
						this.transactions = [];
						for (var i in this.allTransactions) {
							var found = true;
							var pieces = displayCurrency(this.allTransactions[i].amount) + ' ' + this.allTransactions[i].date.toLowerCase() + ' ' + this.allTransactions[i].memo.toLowerCase();
							if (this.isIncoming(this.allTransactions[i])) {
								pieces += ' ' + 'incoming' + ' ' + this.allTransactions[i].from.username.toLowerCase() + ' #' + this.allTransactions[i].from.bankid.toLowerCase();
							} else {
								pieces += ' ' + 'outgoing' + ' ' + this.allTransactions[i].to.username.toLowerCase() + ' #' + this.allTransactions[i].to.bankid.toLowerCase();
							}
							if (this.allTransactions[i].generated) {
								pieces += ' ' + 'generated';
							}
							var query = this.search.toLowerCase().split(' ');

							for (var j in query) {
								if (!(pieces.includes(query[j]))) {
									found = false;
								}
							}
							if (found) {
								this.transactions.push(this.allTransactions[i]);
							}
						}
					};

					this.getIncomingTransactions = function() {
						var output = [];
						for (var i in this.transactions) {
							if (this.isIncoming(this.transactions[i])) {
								output.push(this.transactions[i]);
							}
						}
						return output;
					};
					this.getOutgoingTransactions = function() {
						var output = [];
						for (var i in this.transactions) {
							if (this.isOutgoing(this.transactions[i])) {
								output.push(this.transactions[i]);
							}
						}
						return output;
					};
				},
				controllerAs: 'transactionsCtrl'
			})
			.when('/send', {
				templateUrl: 'static/templates/send-money.html',
				controller: function($http) {
					var store = this;

					this.amount = '';

					this.recipient = '';
					this.memo = '';

					this.getTax = function() {
						return Math.ceil(parseFloat(this.amount) * global_values.taxRate * 100) / 100;
					};
					this.getTotal = function() {
						return parseFloat(this.amount) + this.getTax();
					};

					this.errorMessage = '';
					this.successMessage = '';
					this.sendMoney = function() {
						var payment = {
							amount: this.amount,
							to: this.recipient,
							memo: this.memo
						};

						$http.post('/api/send', payment).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = response.data.message;
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
						});

						this.amount = '';
						this.recipient = '';
						this.memo = '';
					};
					this.validFields = function() {
						var valid_amount = function(amount) {
							if (amount && amount.toString().indexOf('.') > -1) {
								if (amount.toString().split('.')[1].length <= 2 && amount > 0) {
									return true;
								} else {
									return false;
								}
							} else if (amount > 0) {
								return true;
							} else {
								return false
							}

						};
						var valid_recipient = function(username) {
							return true;
						};
						var enough_funds = function(balance, amount) {
							if (balance < amount) {
								return false;
							} else {
								return true;
							}
						};

						if (valid_amount(this.amount) && valid_recipient(this.recipient) && enough_funds(global_values.balance, this.getTotal())) {
							return true;
						} else {
							return false;
						}
					};
				},
				controllerAs: 'sendMoneyCtrl'
			})
			.when('/recent', {
				templateUrl: 'static/templates/new-messages.html',
				controller: function() {
					this.allConversations = [{
						username: 'Joe',
						messages: [{
							from: 'Joe',
							content: 'Hello there!',
							timestamp: new Date().toString()
						}, {
							from: 'Me',
							content: 'Hi!',
							timestamp: new Date().toString()
						}],
						unread: true
					}, {
						username: 'Market',
						messages: [{
							from: 'Market',
							content: 'You purchased an item. The purchase ID is 104.',
							timestamp: new Date().toString()
						}],
						unread: false
					}, {
						username: 'Bob',
						messages: [{
							from: 'Me',
							content: 'Can you send me some money?',
							timestamp: new Date().toString()
						}, {
							from: 'Bob',
							content: 'Why?',
							timestamp: new Date().toString()
						}, {
							from: 'Me',
							content: 'I\'m going to uh... invest them... very well',
							timestamp: new Date().toString()
						}, {
							from: 'Bob',
							content: 'No',
							timestamp: new Date().toString()
						}],
						unread: false
					}, ];
					this.getNewConversations = function() {
						var output = [];
						for (var i in this.allConversations) {
							if (this.allConversations[i].unread === true) {
								output.push(this.allConversations[i]);
							}
						}
						return output;
					};
					this.getAllConversations = function() {
						return this.allConversations;
					};
					this.isMarket = function(conversation) {
						return conversation.username === 'Market';
					};
				},
				controllerAs: 'messagesCtrl'
			})
			.when('/messages', {
				templateUrl: 'static/templates/all-messages.html',
				controller: function() {
					this.allConversations = [{
						username: 'Joe',
						messages: [{
							from: 'Joe',
							content: 'Hello there!',
							timestamp: new Date().toString()
						}, {
							from: 'Me',
							content: 'Hi!',
							timestamp: new Date().toString()
						}],
						unread: true
					}, {
						username: 'Market',
						messages: [{
							from: 'Market',
							content: 'You purchased an item. The purchase ID is 104.',
							timestamp: new Date().toString()
						}],
						unread: false
					}, {
						username: 'Bob',
						messages: [{
							from: 'Me',
							content: 'Can you send me some money?',
							timestamp: new Date().toString()
						}, {
							from: 'Bob',
							content: 'Why?',
							timestamp: new Date().toString()
						}, {
							from: 'Me',
							content: 'I\'m going to uh... invest them... very well',
							timestamp: new Date().toString()
						}, {
							from: 'Bob',
							content: 'No',
							timestamp: new Date().toString()
						}],
						unread: false
					}, ];
					this.getNewConversations = function() {
						var output = [];
						for (var i in this.allConversations) {
							if (this.allConversations[i].unread === true) {
								output.push(this.allConversations[i]);
							}
						}
						return output;
					};
					this.getAllConversations = function() {
						return this.allConversations;
					};
					this.isMarket = function(conversation) {
						return conversation.username === 'Market';
					};
				},
				controllerAs: 'messagesCtrl'
			})
			.when('/find', {
				templateUrl: 'static/templates/find-users.html',
				controller: function($http) {
					var store = this;

					this.search = '';

					this.allUsers = [];
					this.users = this.allUsers;

					this.loaded = false;

					updaters.find = function() {
						$http.get('/api/users').then(function(response) {
							store.allUsers = response.data;
							store.users = response.data;
							store.loaded = true;
							store.doSearch();
						});
					};
					updaters.find();

					this.doSearch = function() {
						this.users = [];
						for (var i in this.allUsers) {
							var found = true;
							var pieces = this.allUsers[i].username.toLowerCase() + ' #' + this.allUsers[i].bankid.toLowerCase() + ' ' + this.allUsers[i].tagline.toLowerCase() + ' ' + displayCurrency(this.allUsers[i].balance);
							if (this.allUsers[i].friend) {
								pieces += ' ' + 'friend';
							}
							if (this.allUsers[i].trusted) {
								pieces += ' ' + 'trusted';
							}
							if (this.allUsers[i].taxExempt) {
								pieces += ' ' + 'tax exempt';
							}
							var query = this.search.toLowerCase().split(' ');

							for (var j in query) {
								if (!(pieces.includes(query[j]))) {
									found = false;
								}
							}
							if (found) {
								this.users.push(this.allUsers[i]);
							}
						}
					};

					this.getAllUsers = function() {
						return this.users;
					};

					this.errorMessage = '';
					this.successMessage = '';

					this.modalUser = null;
					this.newValues = {
						username: null,
						bankid: null,
						balance: null,
						tagline: null,
						password: null,
						trusted: false,
						taxExempt: false
					};

					this.showModal = function(user) {
						this.modalUser = user;
						this.newValues.trusted = user.trusted;
						this.newValues.taxExempt = user.taxExempt;
						$('#editUserModal').modal('show');
					};
					this.submitChanges = function() {
						var newValues = this.newValues;
						this.newValues = {
							username: null,
							bankid: null,
							balance: null,
							tagline: null,
							password: null,
							trusted: false,
							taxExempt: false
						};
						$http.post('/api', {
							page: 'find-edit',
							data: {
								id: this.modalUser.id,
								newValues: newValues
							}
						}).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = 'Updated user';
								updaters.find();
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
						});
					};

					this.deleteUser = function() {
						var newValues = this.newValues;
						this.newValues = {
							username: null,
							bankid: null,
							balance: null,
							tagline: null,
							password: null,
							trusted: false,
							taxExempt: false
						};
						$http.post('/api', {
							page: 'find-delete',
							data: {
								id: this.modalUser.id
							}
						}).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = 'User deleted';
								updaters.find();
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
						});
					};
				},
				controllerAs: 'findUsersCtrl'
			})
			.when('/profile', {
				templateUrl: 'static/templates/my-profile.html',
				controller: function($http) {
					var store = this;

					this.Tagline = '';

					$http.get('/api/user?fields=bankid,tagline').then(function(response) {
						store.CurrentTagline = response.data.tagline;
						store.Tagline = response.data.tagline;
					});

					this.errorMessage = '';
					this.successMessage = '';
					this.updateProfile = function() {
						$http.post('/api', {
							page: 'profile',
							data: {
								tagline: this.Tagline
							}
						}).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = 'Profile updated';
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
						});
					};
				},
				controllerAs: 'profileCtrl'
			})
			.when('/account', {
				templateUrl: 'static/templates/my-account.html',
				controller: function($http) {
					var store = this;

					this.successMessage = '';
					this.errorMessage = '';

					this.password = '';
					this.changePassword = function() {
						var passwordTemp = store.password;
						store.password = '';

						var min_password_length = 1;
						if (passwordTemp.length >= min_password_length) {
							$http.post('/api', {
								page: 'account-password',
								data: {
									password: passwordTemp
								}
							}).then(function(response) {
								if (response.data.success) {
									store.errorMessage = '';
									store.successMessage = 'Password changed';
								} else {
									store.successMessage = '';
									store.errorMessage = response.data.message;
								}
							}, function(response) {
								store.successMessage = '';
								store.errorMessage = error_messages.communication_error;
							});
						} else {
							store.successMessage = '';
							store.errorMessage = 'Password length must be at least ' + min_password_length;
						}
					};
					this.checkPassword = function(event) {
						var key = event.keyCode;
						if (key === 13) {
							this.changePassword();
						}
					};

					this.username = '';
					this.changeUsername = function() {
						var usernameTemp = store.username;
						store.username = '';

						if (usernameTemp.length >= 0) {
							$http.post('/api', {
								page: 'account-username',
								data: {
									username: usernameTemp
								}
							}).then(function(response) {
								if (response.data.success) {
									store.errorMessage = '';
									store.successMessage = 'Username changed';
								} else {
									store.successMessage = '';
									store.errorMessage = response.data.message;
								}
							}, function(response) {
								store.successMessage = '';
								store.errorMessage = error_messages.communication_error;
							});
						} else {
							store.successMessage = '';
							store.errorMessage = 'No username provided';
						}
					};
					this.checkUsername = function(event) {
						var key = event.keyCode;
						if (key === 13) {
							this.changeUsername();
						}
					}
				},
				controllerAs: 'accountCtrl'
			})
			.when('/signout', {
				templateUrl: 'static/templates/sign-out.html'
			})
			.when('/signin', {
				templateUrl: 'static/templates/sign-in.html'
			})
			.when('/createaccount', {
				templateUrl: 'static/templates/create-account.html'
			})
			.when('/shops', {
				templateUrl: 'static/templates/browse-shops.html',
				controller: function() {
					this.search = "";
					this.allShops = [{
						name: 'Food Shop',
						owner: 'Username',
						image: 'static/img/item-yellow.png',
						description: 'We sell high quality food',
						location: {
							x: 300,
							y: 64,
							z: 500
						}
					}];
					this.shops = this.allShops;

					this.getShops = function() {
						return this.shops;
					};
					this.getShopIndex = function(item) {
						return this.shops.indexOf(item);
					};
					this.doSearch = function() {
						this.shops = [];
						for (var i in this.allShops) {
							var found = true;
							var pieces = this.allShops[i].name.toLowerCase() + this.allShops[i].description.toLowerCase() + this.allShops[i].seller.toLowerCase() + this.allItems[i].price;
							var query = this.search.toLowerCase().split(' ');
							for (var j in query) {
								if (!(pieces.includes(query[j]))) {
									found = false;
								}
							}
							if (found) {
								this.shops.push(this.allShops[i]);
							}
						}
					};
					this.enoughFunds = function(price) {
						return true;
					};
				},
				controllerAs: 'shopCtrl'
			})
			.when('/myshops', {
				templateUrl: 'static/templates/my-shops.html'
			})
			.when('/admin', {
				templateUrl: 'static/templates/admin-header.html',
				controller: function($location) {
					console.log('hello');
					$location.path('/admin/logs');
				}
			})
			.when('/admin/logs', {
				templateUrl: 'static/templates/admin-logs.html',
				controller: function($http, $location) {
					var store = this;

					this.lines = [];
					this.loaded = false;

					updaters.adminLogs = function() {
						$http.get('/api/admin/logs?lines=16').then(function(response) {
							if (!response.data) {
								$location.path('/denied');
							} else {
								store.lines = response.data.lines;
								store.loaded = true;
								setTimeout(updaters.adminLogs, 1000);
							}
						});
					};
					updaters.adminLogs();
				},
				controllerAs: 'adminLogsCtrl'
			})
			.when('/denied', {
				templateUrl: 'static/templates/request-denied.html'
			});
	});

	app.directive('mainNavbar', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/main-navbar.html',
			controller: function($http, $window, $location) {
				var store = this;

				updaters.navbar = function() {
					$http.get('/api/user?fields=username,bankid,balance,taxRate,isAdmin').then(function(response) {
						if (!response.data) {
							$window.location.href = '/signin';
						}
						global_values.username = response.data.username;
						global_values.bankid = response.data.bankid;
						global_values.balance = response.data.balance;
						global_values.taxRate = response.data.taxRate;
						global_values.isAdmin = response.data.isAdmin;
						setTimeout(updaters.navbar, 1000);
					});
				};
				updaters.navbar();

				this.getTax = function(amount) {
					return Math.ceil(amount * global_values.taxRate * 100) / 100;
				};
				this.getTotal = function(amount) {
					return this.getTax(amount) + amount;
				};

				this.quicklink = '';
				this.quicklinkData = {
					item: null,
					payment: null
				}

				this.errorMessage = '';
				this.successMessage = '';

				this.submitQuicklink = function() {

					var quicklinkTemp = this.quicklink;
					this.quicklink = '';

					if (quicklinkTemp.length > 1) {
						$http.post('/api', {
							page: 'quicklink',
							data: {
								link: quicklinkTemp
							}
						}).then(function(response) {
							if (response.data.success) {
								store.quicklinkData.item = response.data.quicklink.item;
								store.quicklinkData.payment = response.data.quicklink.payment;
								$('#quicklinkModal').modal('show');
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
								$('#quicklinkResponseModal').modal('show');
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
							$('#quicklinkResponseModal').modal('show');
						});
					}
				};
				this.checkQuicklink = function(event) {
					if (event.charCode === 13) {
						this.submitQuicklink();
					}
				};

				this.modalConfirm = function() {
					if (this.quicklinkData.item) {
						$http.post('/api', {
							page: 'buy',
							data: {
								item: this.quicklinkData.item,
								quantity: 1
							}
						}).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = response.data.message;
								$('#quicklinkResponseModal').modal('show');
								updaters.items();
								updaters.buy();
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
								$('#quicklinkResponseModal').modal('show');
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
							$('#quicklinkResponseModal').modal('show');
						});
					}
					if (this.quicklinkData.payment) {
						$http.post('/api/send', this.quicklinkData.payment).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = response.data.message;
								$('#quicklinkResponseModal').modal('show');
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
								$('#quicklinkResponseModal').modal('show');
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = error_messages.communication_error;
							$('#quicklinkResponseModal').modal('show');
						});
					}
				};
			},
			controllerAs: 'navCtrl'
		};
	});
	app.controller('contentController', function() {
		this.isCurrentPage = function(route) {
			route = '/' + route;
			return current_route === route;
		};
		this.globalValues = global_values;
		this.imageLink = function(string) {
			if (string.indexOf('?') > -1) {
				return string + '&rand' + Date.now() + '=' + Date.now();
			}
			return string + '?rand' + Date.now() + '=' + Date.now();
		};
	});
	app.directive('marketHeader', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/market-header.html'
		};
	});
	app.directive('moneyHeader', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/money-header.html'
		};
	});
	app.directive('messagesHeader', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/messages-header.html'
		};
	});
	app.directive('usersHeader', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/users-header.html'
		};
	});
	app.directive('accountHeader', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/account-header.html'
		};
	});
	app.directive('signinHeader', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/signin-header.html'
		};
	});
	app.directive('shopsHeader', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/shops-header.html'
		};
	});
	app.directive('adminHeader', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/admin-header.html'
		};
	});
	app.directive('loadingIcon', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/loading-icon.html'
		};
	});
	app.directive('fileread', function() {
		return {
			scope: {
				fileread: '='
			},
			link: function(scope, element, attributes) {
				element.bind('change', function(changeEvent) {
					var reader = new FileReader();
					reader.onload = function(loadEvent) {
						scope.$apply(function() {
							scope.fileread = loadEvent.target.result;
						});
					};
					reader.readAsDataURL(changeEvent.target.files[0]);
				});
			}
		}
	});
})();