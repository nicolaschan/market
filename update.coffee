log = require './modules/simple-logger'

async = require 'async'

current_package = require './package.json'
current_version = current_package.version
log.info 'Current version is ' + current_version

newest_version = ''

getLatestPackageInfo = (callback) ->
	https = require 'https'
	log.info 'Fetching package info about the latest version...'
	request = https.get 'https://raw.githubusercontent.com/nicolaschan/market/master/package.json', (res) ->
		body = ''
		res.on 'data', (chunk) ->
			body += chunk
		res.on 'end', ->
			log.success 'Package info fetched'
			callback JSON.parse(body)
	request.on 'error', (err) ->
		log.error err

installNewVersion = (callback) ->
	log.info 'Updating...'

	https = require 'https'
	fs = require 'fs-extra'
	path = require 'path'
	exec = require 'child_process'
		.exec

	temp_directory = __dirname + path.sep + 'temp'
	zip_file_path = temp_directory + path.sep + 'market.zip'

	createTempDirectory = (callback) ->
		if not fs.existsSync temp_directory
			log.info 'Creating temp directory...'
			fs.mkdirSync temp_directory
		callback()
	download = (callback) ->
		exec 'git clone https://github.com/nicolaschan/market.git ' + temp_directory, (err, stdout, stderr) ->
			if err?
				log.erorr 'An error occurred trying to download the latest version, make sure you have git installed'
			else
				log.success 'New version downloaded'
				callback()
	moveOldConfig = (callback) ->
		log.info 'Moving config.json...'

		old_config_path = __dirname + path.sep + 'config.json'
		new_config_path = __dirname + path.sep + 'config-' + current_version + '.json'

		fs.rename old_config_path, new_config_path, (err) ->
			if err?
				log.error err
			else
				log.success 'The old config file has been moved to ' + new_config_path
				log.warn 'You will need to update the new config.json!'
			callback()
	replaceFiles = (callback) ->
		new_market_directory = temp_directory

		replaceFile = (filename, callback) ->
			done = 0
			file_path = new_market_directory + path.sep + filename
			deleteFile = (callback) ->
				fs.remove __dirname + path.sep + filename, (err) ->
					log.debug __dirname + path.sep + filename + ' deleted'
					if err?
						log.error err
					callback()
			moveFile = (callback) ->
				fs.move file_path, __dirname + path.sep + filename, (err) ->
					log.debug file_path + ' moved'
					if err?
						log.error err
					callback()
			async.series [
				deleteFile
				moveFile
				callback
			]
				
		log.info 'Replacing old files with the new ones...'
		fs.readdir new_market_directory, (err, files) ->
			if err?
				log.error err
			async.each files, replaceFile, ->
				log.success 'Done replacing files'
				callback()
	deleteTempDirectory = (callback) ->
		log.info 'Deleting temp folder...'

		escapeSpaces = (string) ->
			pieces = string.split ' '
			output = pieces[0]

			addToOutput = (piece) ->
				output += '\\ ' + piece

			addToOutput piece for piece in pieces[1...]
			return output

		fs.remove temp_directory, (err) ->
			if err?
				log.error err
			callback()
	installDependencies = (callback) ->
		log.info 'Installing dependencies... (this may take a while and requires an internet connection)'
		child = exec 'npm install', (err, stdout, stderr) ->
			if err?
				log.erorr 'An error occurred trying to install dependencies, make sure you have npm installed'
			else
				log.success 'Dependencies installed'
				callback()

	async.series [
		createTempDirectory
		download
		moveOldConfig
		replaceFiles
		deleteTempDirectory
		installDependencies
	]


getLatestPackageInfo (latest_package) ->
	newest_version = latest_package.version
	log.info 'Newest available version is ' + newest_version
	if current_version isnt newest_version
		log.info 'Update is required, updating now...'
		installNewVersion()
	else
		log.success 'Current installation is up to date!'
		log.success 'This market installation is up to date'