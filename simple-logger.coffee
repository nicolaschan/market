output_colored = (color_code, type, message) ->
	console.log '%s\x1b[' + color_code + 'm%s\x1b[0m%s%s', '[', type, '] ', message

log =
	debug: (message) ->
		output_colored 34, 'debug', message
	info: (message) ->
		output_colored 36, 'info', message
	success: (message) ->
		output_colored 32, ' ok ', message
	warn: (message) ->
		output_colored 33, 'warn', message
	error: (message) ->
		output_colored 31, 'error', message

module.exports = log