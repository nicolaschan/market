log = require './simple-logger'

archiver = require 'archiver'
archive = archiver.create 'zip', {}

version = require './package.json'
	.version
log.info 'Archiving version ' + version + '...'

fs = require 'fs'
path = require 'path'
output = fs.createWriteStream __dirname + path.sep + 'releases' + path.sep + 'market-' + version + '.zip'

output.on 'close', ->
	log.success 'Done: ' + archive.pointer() / 1000 + ' kB written'
archive.on 'error', (err) ->
	log.error err

archive.pipe output

deploy_files = require './deploy_files.json'

files = deploy_files.files
directories = deploy_files.directories

appendDirectory = (directory) ->
	archive.directory directory

appendFile = (file_name) ->
	file_path = __dirname + path.sep + file_name

	archive.append fs.createReadStream(file_path), 
		name: file_name

appendFile file for file in files
appendDirectory directory for directory in directories

archive.finalize()
