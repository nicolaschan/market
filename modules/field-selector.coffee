select = (fields, allValues) ->
	if fields? and fields.length > 0
		result = {}

		addToResult = (field) ->
			if allValues[field]?
				result[field] = allValues[field]

		addToResult field for field in fields

		return result
	else
		return allValues

selectWithQueryString = (query, allValues) ->
	fields = if query? then query.split ',' else []
	return select fields, allValues

module.exports.select = select
module.exports.selectWithQueryString = selectWithQueryString