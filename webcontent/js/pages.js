(function() {
	var app = angular.module('pages', ['tabs']);

	app.directive('marketPage', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/market-page.html'
		};
	});
	app.directive('moneyPage', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/money-page.html'
		};
	});
	app.directive('usersPage', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/users-page.html'
		};
	});
	app.directive('messagesPage', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/messages-page.html',
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
		};
	});
})();