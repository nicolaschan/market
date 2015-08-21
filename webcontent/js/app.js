(function() {
	var app = angular.module('market', ['elements', 'ngRoute']);

	var updaters = {};

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

					this.taxRate = 0;
					this.balance = 0;

					this.loaded = false;
					updaters.buy = function() {
						$http.get('/data?page=buy').then(function(response) {
							store.taxRate = response.data.taxRate;
							store.balance = response.data.balance;
							store.allItems = response.data.items;
							store.items = response.data.items;
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
							var pieces = this.allItems[i].name.toLowerCase() + this.allItems[i].description.toLowerCase() + this.allItems[i].owner.toLowerCase() + this.allItems[i].price;
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
						return Math.ceil(amount * store.taxRate * 100) / 100;
					};
					this.getTotal = function(amount) {
						return this.getTax(amount) + amount;
					};
					this.enoughFunds = function(price) {
						if (this.getTotal(price) <= this.balance) {
							return true;
						} else {
							return false;
						}
					};
					this.getBalanceAfter = function(amount) {
						return this.balance - amount;
					};

					this.buy = function(item) {
						$http.post('/', {
							page: 'buy',
							data: {
								item: item
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
							store.errorMessage = 'Communication error with server';
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
						$http.get('/data?page=sell').then(function(response) {
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
							forSale: false
						};

						$http.post('/', {
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
							store.errorMessage = 'Communication error with server';
						});
					};
					this.deleteItem = function(itemId) {
						$http.post('/', {
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
							store.errorMessage = 'Communication error with server';
						});
					};

					this.editingItem = {};
					this.editItem = function() {
						$http.post('/', {
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
							store.errorMessage = 'Communication error with server';
						});
					};
					this.setEditingItem = function(item) {
						this.editingItem = JSON.parse(JSON.stringify(item));
					};
				},
				controllerAs: 'sellItemsCtrl'
			})
			.when('/balance', {
				templateUrl: 'static/templates/balance-tab.html',
				controller: function($http) {
					var store = this;

					this.balance = null;
					$http.get('/data?page=balance').then(function(response) {
						store.balance = response.data.balance;
					});
				},
				controllerAs: 'balanceCtrl'
			})
			.when('/transactions', {
				templateUrl: 'static/templates/transactions-tab.html',
				controller: function($http) {
					var store = this;

					this.search = '';

					this.username = '';
					this.allTransactions = [];
					this.transactions = this.allTransactions;

					this.loaded = false;
					$http.get('/data?page=transactions').then(function(response) {
						store.username = response.data.username;
						store.allTransactions = response.data.transactions;
						store.transactions = response.data.transactions;
						store.loaded = true;
					});

					this.isIncoming = function(transaction) {
						if (transaction.to.username === this.username) {
							return true;
						} else {
							return false;
						}
					};
					this.isOutgoing = function(transaction) {
						if (transaction.from.username === this.username) {
							return true;
						} else {
							return false;
						}
					};

					this.doSearch = function() {
						this.transactions = [];
						for (var i in this.allTransactions) {
							var found = true;
							var pieces = this.allTransactions[i].amount.toString().toLowerCase() + ' ' + this.allTransactions[i].date.toLowerCase() + ' ' + this.allTransactions[i].memo.toLowerCase();
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

					this.taxRate = 0;
					this.balance = 0;

					this.amount = '';

					this.recipient = '';
					this.memo = '';

					$http.get('/data?page=send').then(function(response) {
						store.taxRate = response.data.taxRate;
						store.balance = response.data.balance;
					});


					this.getTax = function() {
						return Math.ceil(parseFloat(this.amount) * this.taxRate * 100) / 100;
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

						$http.post('/', {
							page: 'send',
							data: {
								payment: payment
							}
						}).then(function(response) {
							if (response.data.success) {
								store.errorMessage = '';
								store.successMessage = response.data.message;
							} else {
								store.successMessage = '';
								store.errorMessage = response.data.message;
							}
						}, function(response) {
							store.successMessage = '';
							store.errorMessage = 'Communication error with server';
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

						if (valid_amount(this.amount) && valid_recipient(this.recipient) && enough_funds(this.balance, this.getTotal())) {
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
					$http.get('/data?page=find').then(function(response) {
						store.allUsers = response.data;
						store.users = response.data;
						store.loaded = true;
					});

					this.isIncoming = function(transaction) {
						if (transaction.sender) {
							return true;
						} else {
							return false;
						}
					};

					this.doSearch = function() {
						this.users = [];
						for (var i in this.allUsers) {
							var found = true;
							var pieces = this.allUsers[i].username.toLowerCase() + ' ' + this.allUsers[i].bankid.toLowerCase() + ' ' + this.allUsers[i].tagline.toLowerCase();
							if (this.allUsers[i].friend) {
								pieces += ' ' + 'friend';
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
				},
				controllerAs: 'findUsersCtrl'
			})
			.when('/profile', {
				templateUrl: 'static/templates/my-profile.html',
				controller: function($http) {
					var store = this;

					this.Username = '';
					this.BankId = '';
					this.DatabaseId = '';
					this.Tagline = '';

					$http.get('/data?page=profile').then(function(response) {
						store.Username = response.data.username;
						store.BankId = response.data.bankid;
						store.DatabaseId = response.data.databaseid;
						store.CurrentTagline = response.data.tagline;
						store.Tagline = response.data.tagline;
					});

					this.errorMessage = '';
					this.successMessage = '';
					this.updateProfile = function() {
						$http.post('/', {
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
							store.errorMessage = 'Communication error with server';
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
							$http.post('/', {
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
								store.errorMessage = 'Communication error with server';
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
			});
	});

	app.directive('mainNavbar', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/main-navbar.html',
			controller: function($http, $window, $location) {
				var store = this;

				this.unreadMessagesNumber = 0;
				this.username = '';
				this.balance = 0;

				updaters.navbar = function() {
					$http.get('/data?page=navbar').then(function(response) {
						if (!response.data) {
							$window.location.href = '/signin';
						}
						store.username = response.data.username;
						store.unreadMessagesNumber = response.data.unreadMessagesNumber;
						store.balance = response.data.balance;
						store.taxRate = response.data.taxRate;
						setTimeout(updaters.navbar, 1000);
					});
				};
				updaters.navbar();

				this.getTax = function(amount) {
					return Math.ceil(amount * store.taxRate * 100) / 100;
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
						$http.post('/', {
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
							store.errorMessage = 'Communication error with server';
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
						$http.post('/', {
							page: 'buy',
							data: {
								item: this.quicklinkData.item
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
							store.errorMessage = 'Communication error with server';
							$('#quicklinkResponseModal').modal('show');
						});
					}
					if (this.quicklinkData.payment) {
						$http.post('/', {
							page: 'send',
							data: {
								payment: this.quicklinkData.payment
							}
						}).then(function(response) {
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
							store.errorMessage = 'Communication error with server';
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
	app.directive('loadingIcon', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/loading-icon.html'
		};
	});
})();