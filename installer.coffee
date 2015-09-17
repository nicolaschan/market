log = require './simple-logger'

sys = require 'sys'
exec = require 'child_process'
	.exec

log.info 'Minecraft Market installer'

installDependencies = (callback) ->
	log.info 'Installing dependencies... (this may take a while and requires an internet connection)'
	child = exec 'npm install', (err, stdout, stderr) ->
		if err?
			log.erorr 'An error occurred trying to install dependencies, make sure you have npm installed'
		else
			log.success 'Dependencies installed'
			callback()

setConfig = (callback) ->
	log.warn '-----------------------------------------------------------------------'
	log.warn '** IMPORTANT ** Please edit the config.json to use the correct settings'
	log.warn '-----------------------------------------------------------------------'


performInstallation = ->
	installDependencies setConfig

performInstallation()