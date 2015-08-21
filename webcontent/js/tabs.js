(function() {
	var app = angular.module('tabs', ['elements']);

	app.directive('sellItems', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/sell-items.html',
			controller: function() {
				this.search = '';
				this.allItems = [{
					name: 'My personal item',
					seller: 'Me',
					image: 'static/img/item-blue.png',
					description: 'Personal item from the <3',
					price: 1000
				}];
				this.items = this.allItems;

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
			},
			controllerAs: 'sellItemsCtrl'
		};
	});
	app.directive('balanceTab', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/balance-tab.html',
			controller: function() {
				this.getBalance = function() {
					return 1000;
				};
			},
			controllerAs: 'balanceCtrl'
		};
	});
	app.directive('transactionsTab', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/transactions-tab.html',
			controller: function() {
				this.search = '';

				this.allTransactions = [{
					amount: 10,
					sender: 'Sender',
					timestamp: new Date().toString(),
					memo: 'Purchased Item (id: 52)',
					market: true
				}, {
					amount: 50,
					sender: 'Sender',
					timestamp: new Date().toString(),
					memo: 'thanks for the help',
					market: false
				}, {
					amount: 100,
					recipient: 'Recipient',
					timestamp: new Date().toString(),
					memo: 'Purchased Item (id: 100)',
					market: true
				}, {
					amount: 5,
					recipient: 'Market',
					timestamp: new Date().toString(),
					memo: 'Auto tax (5%)',
					market: true
				}];
				this.transactions = this.allTransactions;

				this.isIncoming = function(transaction) {
					if (transaction.sender) {
						return true;
					} else {
						return false;
					}
				};

				this.doSearch = function() {
					this.transactions = [];
					for (var i in this.allTransactions) {
						var found = true;
						var pieces = this.allTransactions[i].amount.toString().toLowerCase() + ' ' + this.allTransactions[i].timestamp.toLowerCase() + ' ' + this.allTransactions[i].memo.toLowerCase();
						if (this.isIncoming(this.allTransactions[i])) {
							pieces += ' ' + 'incoming' + ' ' + this.allTransactions[i].sender.toLowerCase();
						} else {
							pieces += ' ' + 'outgoing' + ' ' + this.allTransactions[i].recipient.toLowerCase();
						}
						if (this.allTransactions[i].market) {
							pieces += ' ' + 'market';
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
						if (!this.isIncoming(this.transactions[i])) {
							output.push(this.transactions[i]);
						}
					}
					return output;
				};
			},
			controllerAs: 'transactionsCtrl'
		};
	});
	app.directive('sendMoney', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/send-money.html',
			controller: function() {
				this.taxRate = 0.05;
				this.amount = '';

				this.totalAmount = this.amount + this.tax;

				this.recipient = '';
				this.memo = '';

				this.getTax = function() {
					return Math.ceil(parseFloat(this.amount) * this.taxRate * 100) / 100;
				};
				this.getTotal = function() {
					return parseFloat(this.amount) + this.getTax();
				};
				this.sendMoney = function() {
					var payment = {
						amount: this.amount,
						recipient: this.recipient,
						memo: this.memo
					};

					this.amount = '';
					this.recipient = '';
					this.memo = '';
				};
				this.validFields = function() {
					var valid_amount = function(amount) {
						if (amount && amount.toString().includes('.')) {
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

					if (valid_amount(this.amount) && valid_recipient(this.recipient)) {
						return true;
					} else {
						return false;
					}
				};
			},
			controllerAs: 'sendMoneyCtrl'
		};
	});
	app.directive('newMessages', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/new-messages.html',
			controller: function() {},
			controllerAs: 'newMessagesCtrl'
		};
	});
	app.directive('allMessages', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/all-messages.html',
			controller: function() {},
			controllerAs: 'allMessagesCtrl'
		};
	});
})();