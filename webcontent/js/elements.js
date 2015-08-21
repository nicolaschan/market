(function() {
	var app = angular.module('elements', []);

	app.directive('conversationElement', function() {
		return {
			restrict: 'E',
			templateUrl: 'static/templates/conversation-element.html',
			controller: function() {},
			controllerAs: 'conversationCtrl'
		};
	});
})();