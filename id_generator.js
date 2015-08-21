(function() {
	var chars = require('./non-ambiguous-characters.json');

	var convertBase = function(value, input_alphabet, output_alphabet) {
		var toBase10 = function(input, alphabet) {
			input = input.toString();

			var output = 0;

			var neg = false;
			if (input.substring(0, 1) === '-') {
				neg = true;
				input = input.substring(1);
			}

			var input_array = input.split('').reverse();

			for (var i in input_array) {
				output += alphabet.indexOf(input_array[i]) * (Math.pow(alphabet.length, i));
			}

			if (neg) {
				output = output * -1;
			}

			return output;
		};
		var fromBase10 = function(input, alphabet) {
			var output = '';

			var neg = false;
			if (input < 0) {
				neg = true;
				input = Math.abs(input);
			}

			while (input > 0) {
				if (((input % alphabet.length) === 0) && (input / alphabet.length < alphabet.length)) {
					output = alphabet[input / alphabet.length] + output;
					input = 0;
				} else {
					output = alphabet[input % alphabet.length] + output;
					input = input - (input % alphabet.length);
					input = input / alphabet.length;
				}
			}

			if (neg) {
				output = '-' + output;
			}

			return output;
		};
		return fromBase10(toBase10(value, input_alphabet), output_alphabet);
	};


	var toDec = function(id) {

	};
	var toID = function(dec) {
		return convertBase(dec.toString(), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], chars);
	};
	var setLength = function(id, length) {

		var output = '';

		if (id.substring(0, 1) === '-') {
			output += '-';
			id = id.substring(1);
		}

		for (var i = 0; i < length - id.length; i++) {
			output += chars[0];
		}
		output += id;
		return output;
	};


	var getLogBase = function(number, base) {
		return Math.log(number) / Math.log(base);
	};

	module.exports.generate = function(number, options) {
		if (options) {
			var defaults = {
				from_alphabet: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
				to_alphabet: chars
			};
			if (options.from_alphabet) {
				defaults.from_alphabet = options.from_alphabet;
			}
			if (options.to_alphabet) {
				defaults.to_alphabet = options.to_alphabet;
			}
			var output = convertBase(number, defaults.from_alphabet, defaults.to_alphabet);
			if (options.min_length) {
				output = setLength(output, options.min_length);
			}
			return output;
		}
		return toID(number);
	};
})();