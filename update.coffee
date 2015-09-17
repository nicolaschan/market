log = require './simple-logger'

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
	https = require 'https'
	fs = require 'fs'
	path = require 'path'

	temp_directory = __dirname + path.sep + 'temp'

	if not fs.existsSync temp_directory
		fs.mkdirSync temp_directory

	moveOldConfig = (old_config_path, callback) ->
		log.info 'Moving config.json...'

		new_config_path = __dirname + path.sep + 'config-' + current_version + '.json'
		fs.rename old_config_path, new_config_path, (err) ->
			if err?
				log.error err
			else
				log.success 'The old config file has been moved to ' + new_config_path
				log.warn 'You will need to update the new config.json!'
			callback()

	replaceFiles = ->
		new_market_directory = temp_directory + path.sep + 'market-' + '1.0.0-pre1'

		replaceFile = (filename) ->
			file_path = new_market_directory + path.sep + filename
			fs.stat file_path, (err, stats) ->
				if stats.isFile()
					fs.rename file_path, __dirname + path.sep + filename, (err) ->
						if err?
							log.error err
				if stats.isDirectory()
					ncp = require 'ncp'
						.ncp
					ncp file_path, __dirname + path.sep + filename, (err) ->
						if err?
							log.error err
						else
							fs.unlink file_path, (err) ->
								log.error err

		log.info 'Replacing old files with the new ones...'
		fs.readdir 'temp/market-1.0.0-pre1', (err, files) ->
			if err?
				log.error err
			else
				replaceFile file for file in files
				log.success 'Done replacing files'

	zip_file_path = temp_directory + path.sep + 'market.zip'
	zip_file = fs.createWriteStream zip_file_path

	log.info 'Downloading new version...'
	archive_url = 'https://codeload.github.com/nicolaschan/market/zip/v1.0.0-pre1'
	request = https.get archive_url, (res) ->
		res.pipe zip_file

		res.on 'end', ->
			log.success 'Download complete'

			log.info 'Extracting downloaded zip file...'
			unzip = require 'unzip'
			zip_readstream = fs.createReadStream zip_file_path

			zip_readstream
				.pipe unzip.Extract
					path: temp_directory
			log.success 'Extract complete'

			log.info 'Deleting zip file...'
			fs.unlink zip_file_path, (err) ->
				if err?
					log.error err
				else
					log.success 'Zip file deleted'

					moveOldConfig __dirname + path.sep + 'config.json', ->
						replaceFiles()

getLatestPackageInfo (latest_package) ->
	newest_version = latest_package.version
	log.info 'Newest available version is ' + newest_version
	if current_version isnt newest_version
		log.info 'Update is required, updating now...'
		installNewVersion()
	else
		log.success 'Current installation is up to date!'
		log.success 'This market installation is up to date'