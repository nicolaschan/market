var app = function(user_config) {
	var config = {
		port: {
			http: 8080,
			https: 8080
		},
		https: {
			enabled: false,
			key: 'keys/example.com.key',
			cert: 'keys/example.com.crt'
		},
		mongodb: {
			host: 'database.example.com',
			port: 27017,
			database: 'market'
		},
		logger: {
			filename: 'main.log',
			level: 'ALL'
		},
		tax: {
			rate: 0.05,
			recipient: 'tax'
		},
		admins: ['market'],
		default_tagline: 'A market user'
	};

	var config_properties_loaded = 0;
	var essential_config_properties = {
		mongodb: false
	};

	for (var key in user_config) {
		config[key] = user_config[key];

		if (essential_config_properties[key] === false) {
			essential_config_properties[key] = true;
		}
		config_properties_loaded++;
	}

	var getLogger = function(name, level) {
		var log4js = require('log4js');
		log4js.configure({
			appenders: [{
				type: 'console'
			}, {
				type: 'file',
				filename: 'logs/' + config.logger.filename,
				category: name
			}]
		});

		var logger = log4js.getLogger(name);
		logger.setLevel(level);

		return logger;
	};

	var logger = getLogger('market', config.logger.level);

	// check if config properties are loaded correctly
	if (config_properties_loaded <= 0) {
		logger.warn('No configuration properties loaded, using default values');
	} else {
		logger.debug(config_properties_loaded + ' configuration properties loaded');
	}
	for (var key in essential_config_properties) {
		if (!essential_config_properties[key]) {
			logger.warn('Configuration property \"' + key + '\" was not provided. This will cause problems.');
		}
	}
	logger.trace('Configuration values are: ' + JSON.stringify(config));

	var fs = require('fs');
	var required_directories = [{
		name: 'user-content',
		contents: [{
			name: 'item-images'
		}]
	}];
	var create_required_directories = function(super_directory, tree) {
		for (var i in tree) {
			var directory = super_directory + '/' + tree[i].name;
			if (!fs.existsSync(directory)) {
				logger.trace('Required directory \"' + directory + '\" not found');
				fs.mkdir(directory);
				logger.debug('Required directory \"' + directory + '\" created');
			}
			if (tree[i].contents && tree[i].contents.length > 0) {
				create_required_directories(directory, tree[i].contents);
			}
		}
	};
	create_required_directories('.', required_directories);


	var web_server;
	var mongoose = require('mongoose'),
		Schema = mongoose.Schema,
		conn = mongoose.connection;

	this.start = function() {
		logger.debug('Starting market app...');
		var start_time = Date.now();

		logger.debug('Logging at level: ' + logger.level.levelStr);

		var getDatabaseURL = function(mongodb) {
			return 'mongodb://' + mongodb.host + ':' + mongodb.port + '/' + mongodb.database;
		};

		logger.trace('Connecting to database at ' + getDatabaseURL(config.mongodb) + '...');
		mongoose.connect(getDatabaseURL(config.mongodb));

		conn.once('open', function() {
			logger.debug('Database connection open to ' + getDatabaseURL(config.mongodb));

			var conversationsSchema = new Schema({
				users: [String],
				messages: [{
					from: String,
					to: String,
					date: Date,
					message: String
				}]
			}, {
				collection: 'conversations'
			});
			var itemsSchema = new Schema({
				id: String,
				owner: String,
				name: String,
				description: String,
				price: Number,
				quantity: Number,
				instructions: String,
				image: String,
				forSale: Boolean,
				quicklink: String
			}, {
				collection: 'items'
			});
			var shopsSchema = new Schema({
				owner: String,
				managers: [String],
				inventory: [String]
			}, {
				collection: 'shops'
			});
			var transactionsSchema = new Schema({
				from: String,
				to: String,
				date: Date,
				amount: Number,
				memo: String,
				generated: Boolean
			}, {
				collection: 'transactions'
			});
			var usersSchema = new Schema({
				id: String,
				username: String,
				username_lower: String,
				bankid: String,
				password: String,
				balance: Number,
				tagline: String,
				trusted: Boolean,
				taxExempt: Boolean
			}, {
				collection: 'users'
			});
			var quicklinksSchema = new Schema({
				link: String,
				item: String,
				payment: {
					to: String,
					amount: Number,
					memo: String
				}
			}, {
				collection: 'quicklinks'
			});
			var receiptsSchema = new Schema({
				id: String,
				proof: String,
				buyer: String,
				seller: String,
				recipient: String,
				date: Date,
				item: {
					name: String,
					quantity: Number,
					description: String,
					instructions: String
				}
			});

			var uuid = require('node-uuid');
			var getUniqueId = function(prefix) {
				return prefix + '-' + uuid.v1();
			};

			var shortid = require('shortid');
			var getShortId = function(prefix) {
				return shortid.generate();
			};

			var password_hasher = require('password-hash-and-salt');

			var UsersModel = mongoose.model('user', usersSchema);
			var ItemsModel = mongoose.model('items', itemsSchema);
			var TransactionsModel = mongoose.model('transactions', transactionsSchema);
			var QuicklinksModel = mongoose.model('quicklinks', quicklinksSchema);
			var ReceiptsModel = mongoose.model('receipts', receiptsSchema);

			var quote = function(string) {
				return '\"' + string + '\"';
			};

			var displayUser = function(username, bankid) {
				return username + ' (#' + bankid + ')';
			};

			var saveImage = function(string, id, req, callback) {
				if (string) {
					var filetype = string.split(':')[1].split('/')[0];
					var extension = string.split(':')[1].split('/')[1].split(';')[0];
					if (filetype === 'image' && (extension === 'png' || extension === 'jpeg')) {
						fs.writeFile(__dirname + '/user-content/item-images/' + id, string.split(',')[1], 'base64', function(err) {
							return callback(err);
						});
					}
				}
				return callback();
			};

			var checkIsAdmin = function(bankid) {
				var admins = config.admins;
				if (admins.indexOf(bankid) > -1) {
					return true;
				}
				return false;
			};

			var idToUsername = function(id, callback) {
				UsersModel.findOne({
					id: id
				}).lean().exec(function(err, data) {
					callback(data.username);
				});
			};

			var isValidUsername = function(username, result) {
				var minimum_length = 3;
				var maximum_length = 16;
				if (!/^[a-zA-Z0-9_]*$/g.test(username)) {
					logger.trace(quote(username) + ' is not a valid username because it contains illegal characters');
					return result({
						success: false,
						message: 'Username may only contain letters, numbers, and underscore'
					});
				}
				if (username.length < minimum_length || username.length > maximum_length) {
					logger.trace(quote(username) + ' is not a valid username because it is not an acceptable length');
					return result({
						success: false,
						message: 'Username must be ' + minimum_length + ' to ' + maximum_length + ' characters long'
					});
				}

				UsersModel.findOne({
					username_lower: username.toLowerCase()
				}).lean().count(function(err, count) {
					if (count > 0) {
						logger.trace(quote(username) + ' is not an available username');
						return result({
							success: false,
							message: 'Username is taken'
						});
					} else {
						logger.trace(quote(username) + ' is a valid username');
						return result({
							success: true
						});
					}
				});
			};

			var deleteUser = function(user, callback) {
				transferMoney({
					sender: user.id,
					recipient: market.id,
					amount: user.balance / 100,
					memo: 'Account deleted: ' + displayUser(user.username, user.bankid),
					generated: true

				}, function() {
					ItemsModel.find({
						owner: user.id
					}).remove().exec(function() {
						logger.warn('TODO: properly remove a deleted user\'s items');
						user.remove();
						callback();
					});
				});
			};

			var createUser = function(credentials, success) {
				var isBankIdValid = function(bankid, result) {
					bankid = bankid.toLowerCase();
					var minimum_length = 3;
					var maximum_length = 16;
					if (!/^[a-zA-Z0-9_]*$/g.test(bankid)) {
						return result({
							success: false,
							message: 'Bank ID may only contain letters, numbers, and underscore'
						});
					}
					if (bankid.length < minimum_length && bankid.length > maximum_length) {
						return result({
							success: false,
							message: 'Bank ID must be ' + minimum_length + ' to ' + maximum_length + ' characters long'
						});
					}

					UsersModel.findOne({
						bankid: bankid
					}).lean().count(function(err, count) {
						if (count > 0) {
							return result({
								success: false,
								message: 'Bank ID is taken'
							});
						} else {
							return result({
								success: true
							});
						}
					});
				};

				var saveUser = function(credentials) {
					var user = new UsersModel({
						id: getUniqueId('user'),
						username: credentials.username,
						username_lower: credentials.username.toLowerCase(),
						password: credentials.password_hash,
						bankid: credentials.bankid,
						balance: 10000 * 100,
						tagline: config.default_tagline,
						trusted: false,
						taxExempt: false
					});
					user.save(function(err) {
						if (err) {
							success({
								success: false,
								reason: 'Unable to save user to database. Try again.'
							});
							logger.error(err);
						} else {
							success({
								success: true
							});
						}
					});
				};

				isValidUsername(credentials.username, function(result) {
					if (result.success) {
						isBankIdValid(credentials.bankid, function(result) {
							if (result.success) {
								saveUser(credentials);
							} else {
								success(result);
							}
						});
					} else {
						success(result);
					}
				});
			};

			var transferMoney = function(args, callback) {
				var sender = args.sender;
				var recipient = args.recipient;
				var amount = args.amount;
				var memo = args.memo;
				var generated = args.generated;

				var addMoney = function(user, amount, callback) {
					UsersModel.update({
						id: user
					}, {
						$inc: {
							balance: amount * 100
						}
					}, function() {
						callback();
					});
				};

				var getBalance = function(user, callback) {
					UsersModel.findOne({
						id: user
					}).lean().exec(function(err, user) {
						if (err) {
							return callback(err);
						} else {
							return callback(null, user.balance);
						}
					});
				};

				if (amount > 0) {
					getBalance(sender, function(err, balance) {
						if (err) {
							return callback(err);
						} else {
							if (balance >= amount) {
								addMoney(sender, -1 * amount, function() {
									addMoney(recipient, amount, function() {
										(new TransactionsModel({
											from: sender,
											to: recipient,
											amount: amount,
											memo: memo,
											date: Date.now(),
											generated: generated
										})).save();
										return callback(null);
									});
								});
							} else {
								return callback('Not enough funds in account');
							}
						}
					});
				} else {
					return callback(null);
				}
			};

			var express = require('express');
			var app = express();

			var session = require('express-session');
			app.use(session({
				secret: 'keyboard cat',
				resave: true,
				saveUninitialized: false
			}));

			var passport = require('passport');
			var LocalStrategy = require('passport-local').Strategy;

			passport.use(new LocalStrategy({
				passReqToCallback: true
			}, function(req, username, password, done) {
				if (username.substring(0, 1) === '#') {
					UsersModel.findOne({
						bankid: username.substring(1).toLowerCase().trim()
					}, function(err, user) {
						if (err) {
							return done(err);
						}
						if (!user) {
							logger.debug(req.ip + ' provided invalid sign in credentials (reason: bank ID not found): ' + username);
							return done(null, false, {
								message: 'Incorrect username or password'
							});
						}
						password_hasher(password).verifyAgainst(user.password, function(err, verified) {
							if (err) {
								logger.error(err);
							}
							if (verified) {
								logger.info(displayUser(user.username, user.bankid) + ' signed in from ' + req.ip);
								return done(null, user);
							} else {
								logger.debug(req.ip + ' provided invalid sign in credentials (reason: incorrect password): ' + displayUser(user.username, user.bankid));
								return done(null, false, {
									message: 'Incorrect username or password'
								});
							}
						});
					});
				} else {
					UsersModel.findOne({
						username_lower: username.toLowerCase().trim()
					}, function(err, user) {
						if (err) {
							return done(err);
						}
						if (!user) {
							logger.debug(req.ip + ' provided invalid sign in credentials (reason: user not found): ' + username);
							return done(null, false, {
								message: 'Incorrect username or password'
							});
						}
						password_hasher(password).verifyAgainst(user.password, function(err, verified) {
							if (err) {
								logger.error(err);
							}
							if (verified) {
								logger.info(displayUser(user.username, user.bankid) + ' signed in from ' + req.ip);
								return done(null, user);
							} else {
								logger.debug(req.ip + ' provided invalid sign in credentials (reason: incorrect password): ' + displayUser(user.username, user.bankid));
								return done(null, false, {
									message: 'Incorrect username or password'
								});
							}
						});
					});
				}
			}));
			passport.serializeUser(function(user, done) {
				done(null, user.id);
			});
			passport.deserializeUser(function(id, done) {
				UsersModel.findOne({
					id: id
				}, function(err, user) {
					done(err, user);
				});
			});
			app.use(passport.initialize());
			app.use(passport.session());

			var bodyParser = require('body-parser');
			app.use(bodyParser.json({
				limit: '5mb'
			}));
			app.use(bodyParser.urlencoded({
				limit: '5mb',
				extended: true
			}));

			var flash = require('connect-flash');
			app.use(flash());

			app.use('/static', express.static('webcontent'));

			app.get('/signin', function(req, res) {
				res.render('signin.jade', {
					message: req.flash('error')
				});
			});

			app.post('/api/signin', passport.authenticate('local', {
				successRedirect: '/#/profile',
				failureRedirect: '/signin',
				failureFlash: true
			}));

			app.get('/createaccount', function(req, res) {
				res.render('createaccount.jade', {
					message: req.flash('message'),
					username: req.flash('username'),
					bankid: req.flash('bankid')
				});
			});

			app.post('/createaccount', function(req, res) {
				var respond = function(status) {
					if (status.success) {
						logger.info(req.ip + ' created a new account: ' + displayUser(req.body.username, req.body.bankid));
						res.redirect('/signin');
					} else {
						req.flash('message', status.message);
						res.redirect('/createaccount');
					}
				};

				var user_info = req.body;

				req.flash('username', req.body.username);
				req.flash('bankid', req.body.bankid);

				password_hasher(user_info.password).hash(function(err, hash) {
					if (err) {
						logger.error(err);
					} else {
						createUser({
							username: user_info.username.trim(),
							password_hash: hash,
							bankid: user_info.bankid.toLowerCase().trim()
						}, respond);
					}
				});
			});

			app.get('/', function(req, res) {
				res.sendFile(__dirname + '/webcontent/index.html');
			});

			var isValidTagline = function(tagline) {
				if (!tagline) {
					return false;
				}
				var minimum_length = 1;
				var maximum_length = 32;
				if (tagline.length < minimum_length) {
					return false;
				}
				if (tagline.length > maximum_length) {
					return false;
				}

				return true;
			};

			var isValidItemInfo = function(item, callback) {
				var name_length_min = 1;
				var name_length_max = 32;
				if (item.name.length < name_length_min) {
					return callback({
						success: false,
						message: 'Item name is too short (must be at least ' + name_length_min + ')'
					});
				}
				if (item.name.length > name_length_max) {
					return callback({
						success: false,
						message: 'Item name is too long (must be at most ' + name_length_min + ')'
					});
				}

				var description_length_min = 0;
				var description_length_max = 140;
				if (item.description.length < description_length_min) {
					return callback({
						success: false,
						message: 'Item description is too short (must be at least ' + description_length_min + ')'
					});
				}
				if (item.description.length > description_length_max) {
					return callback({
						success: false,
						message: 'Item description is too long (must be at most ' + description_length_max + ')'
					});
				}

				var instructions_length_min = 0;
				var instructions_length_max = 140;
				if (item.instructions.length < instructions_length_min) {
					return callback({
						success: false,
						message: 'Item instructions are too short (must be at least ' + instructions_length_min + ')'
					});
				}
				if (item.instructions.length > instructions_length_max) {
					return callback({
						success: false,
						message: 'Item instructions are too long (must be at most ' + instructions_length_max + ')'
					});
				}

				var price_min = 0;
				var price_max = 1000000000;
				if (typeof(item.price) !== 'number') {
					return callback({
						success: false,
						message: 'Item price is invalid'
					});
				}
				if (item.price < price_min) {
					return callback({
						success: false,
						message: 'Item price is too low (must be at least ' + displayCurrency(price_min) + ')'
					});
				}
				if (item.price > price_max) {
					return callback({
						success: false,
						message: 'Item price is too high (must be at most ' + displayCurrency(price_max) + ')'
					});
				}

				if (typeof(item.forSale) !== 'boolean') {
					return callback({
						success: false,
						message: 'For Sale value is invalid'
					});
				}

				return callback({
					success: true
				});
			};

			var userByUsername = function(username, callback) {
				UsersModel.findOne({
					username_lower: username.toLowerCase()
				}).lean().exec(function(err, data) {
					callback(err, data)
				});
			};
			var userByBankId = function(bankid, callback) {
				UsersModel.findOne({
					bankid: bankid.toLowerCase()
				}).lean().exec(function(err, data) {
					callback(err, data)
				});
			};
			var userById = function(id, callback) {
				UsersModel.findOne({
					id: id
				}).lean().exec(function(err, data) {
					callback(err, data)
				});
			};

			var displayCurrency = function(amount) {
				amount = amount.toLocaleString();
				if (amount.indexOf('.') > -1) {
					var characters_after_dot_length = amount.substring(amount.indexOf('.')).length - 1;
					while (characters_after_dot_length < 2) {
						characters_after_dot_length++;
						amount += '0';
					}
					return '$' + amount;
				} else {
					return '$' + amount.toString() + '.00';
				}
			};

			var getQuicklinkId = function(callback) {
				fs.readFile('quicklink_id_number.json', 'utf-8', function(err, data) {
					if (err) {
						return callback(err);
					}

					var id_generator = require('./id_generator');
					var id = id_generator.generate(parseInt(data), {
						min_length: 3
					});

					fs.writeFile('quicklink_id_number.json', parseFloat(data) + 1, 'utf-8', function(err) {
						if (err) {
							return callback(err);
						}
						return callback(null, id);
					});
				});
			};
			var market;
			var setMarket = function() {
				userByBankId(config.tax.recipient, function(err, data) {
					if (err || !data) {
						logger.warn('User to receive the tax money could not be found. This is probably a configuration error.')
					} else {
						logger.debug('Tax recipent is ' + displayUser(data.username, data.bankid));
						market = data;
					}
				});
			};
			setMarket();

			app.post('/api', function(req, res) {
				if (req.user) {
					switch (req.body.page) {
						case 'profile':
							if (isValidTagline(req.body.data.tagline)) {
								req.user.tagline = req.body.data.tagline;
								req.user.save();
								res.send({
									success: true
								})
							} else {
								res.send({
									success: false,
									message: 'Invalid tagline, must be 1 to 32 characters long',
								});
							}
							break;
						case 'send':
							var payment = req.body.data.payment;

							var sender = req.user;
							var recipient;

							var taxRate = config.tax.rate;

							if (req.user.taxExempt) {
								taxRate = 0;
							}

							if (payment.to.substring(0, 1) === '#') {
								userByBankId(payment.to.substring(1), function(err, data) {
									if (err || !data) {
										return res.send({
											success: false,
											message: 'User with Bank ID ' + payment.to + ' could not be found'
										})
									} else {
										recipient = data;
										continue_sending();
									}
								});
							} else {
								userByUsername(payment.to, function(err, data) {
									if (err || !data) {
										return res.send({
											success: false,
											message: 'User with username ' + quote(payment.to) + ' could not be found'
										});
									} else {
										recipient = data;
										continue_sending();
									}
								});
							}

							var continue_sending = function() {
								var getTax = function(amount) {
									return Math.ceil(parseFloat(amount) * taxRate * 100) / 100;
								};
								var getTotal = function(amount) {
									return getTax(amount) + amount;
								};
								if (sender.id === recipient.id) {
									return res.send({
										success: false,
										message: 'You can\'t send money to yourself!'
									});
								}

								var valid_amount = function(amount) {
									if (amount && amount.toString().indexOf('.') > -1) {
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
								var valid_memo = function(memo) {
									var minimum_length = 0;
									var maximum_length = 32;
									if (memo < minimum_length || memo > maximum_length) {
										return false;
									} else {
										return true;
									}
								};

								if (valid_memo(payment.memo)) {
									if (valid_amount(payment.amount)) {
										if (payment.amount > 0) {
											if (sender.balance / 100 >= getTotal(payment.amount)) {
												transferMoney({
													sender: sender.id,
													recipient: market.id,
													amount: getTax(payment.amount),
													memo: (taxRate * 100) + '% automatic tax',
													generated: true

												}, function() {
													transferMoney({
														sender: sender.id,
														recipient: recipient.id,
														amount: payment.amount,
														memo: payment.memo,
														generated: false
													}, function() {
														logger.info(displayUser(sender.username, sender.bankid) + ' sent ' + displayCurrency(payment.amount) + ' to ' + displayUser(recipient.username, recipient.bankid));
														return res.send({
															success: true,
															message: displayCurrency(payment.amount) + ' was sent to ' + recipient.username + ' (#' + recipient.bankid + ')'
														});
													});
												});

											} else {
												return res.send({
													success: false,
													message: 'Not enough funds in your account'
												});
											}
										} else {
											return res.send({
												success: false,
												message: 'You must send some money'
											});
										}
									} else {
										return res.send({
											success: false,
											message: 'Invalid amount'
										});
									}
								} else {
									return res.send({
										success: false,
										message: 'Invalid memo'
									});
								}
							};
							break;
						case 'items':
							var getRandomImage = function() {
								var prefix = 'static/img/items/'
								var images = ['black', 'blue', 'cyan', 'gray', 'green', 'lightgray', 'magenta', 'pink', 'purple', 'red', 'yellow'];
								var suffix = '.jpg';

								var random = require('random-to');
								return prefix + images[random.from0upto(images.length)] + suffix;
							};

							isValidItemInfo(req.body.data.item, function(result) {
								if (result.success) {
									var itemId = getUniqueId('item');

									var image = getRandomImage();

									var continue_create_item = function() {
										getQuicklinkId(function(err, id) {
											if (err) {
												return res.send({
													success: false,
													message: 'Error generating quicklink link'
												});
											}

											var item = new ItemsModel({
												id: itemId,
												owner: req.user.id,
												name: req.body.data.item.name,
												description: req.body.data.item.description,
												price: req.body.data.item.price,
												quantity: req.body.data.item.quantity,
												instructions: req.body.data.item.instructions,
												image: image,
												forSale: req.body.data.item.forSale,
												quicklink: id
											});
											var quicklink = new QuicklinksModel({
												link: id,
												item: itemId
											});
											quicklink.save(function(err) {
												if (err) {
													return res.send({
														success: false,
														message: 'Error saving quicklink to database'
													});
												} else {
													item.save(function(err) {
														if (err) {
															return res.send({
																success: false,
																message: 'Error saving item to database'
															});
														} else {
															logger.info(displayUser(req.user.username, req.user.bankid) + ' created new item \'' + req.body.data.item.name + '\' (@' + id + ')');
															return res.send({
																success: true
															});
														}
													});
												}
											});
										});
									};

									if (req.body.data.item.image) {
										saveImage(req.body.data.item.image, itemId, req, function(err) {
											if (err) {
												logger.error('Error saving image ' + itemId);
											} else {
												logger.debug(displayUser(req.user.username, req.user.bankid) + ' (at ' + req.ip + ') uploaded image ' + itemId);
												image = 'user-content/item-images?id=' + itemId;
											}
										});
										continue_create_item();
									} else {
										continue_create_item();
									}

								} else {
									return res.send(result);
								}
							});

							break;
						case 'items-delete':
							ItemsModel.findOne({
								id: req.body.data.itemId,
								owner: req.user.id
							}).exec(function(err, item) {
								logger.info(displayUser(req.user.username, req.user.bankid) + ' is deleting item \'' + item.name + '\' (@' + item.quicklink + ')');
								if (item.image.substring(0, 24) === 'user-content/item-images') {
									var extension = item.image.split('.')[item.image.split('.').length - 1];
									fs.unlink(__dirname + '/user-content/item-images/' + item.id, function(err) {
										if (err) {
											logger.error(err);
											logger.error('Error removing file ' + __dirname + '/user-content/item-images/' + item.id);
										} else {
											logger.debug('Deleted file ' + __dirname + '/user-content/item-images/' + item.id);
										}
										item.remove();
										return res.send({
											success: true
										});
									});
								} else {
									logger.debug('No image to remove for item \'' + item.name + '\' (@' + item.quicklink + ')');
									item.remove();
									return res.send({
										success: true
									});
								}
							});
							break;
						case 'items-edit':
							isValidItemInfo(req.body.data.item, function(result) {
								if (result.success) {
									if (req.body.data.item.image.substring(0, 7) !== 'static/') {
										ItemsModel.findOne({
											id: req.body.data.item.id,
											owner: req.user.id
										}).exec(function(err, item) {
											if (err) {
												return res.send({
													success: false,
													message: 'Could not find specified item'
												});
											}
											saveImage(req.body.data.item.image, item.id, req, function(err) {
												if (err) {
													logger.error('Error saving image ' + item.id);
												} else {
													logger.debug(displayUser(req.user.username, req.user.bankid) + ' (at ' + req.ip + ') uploaded image ' + item.id);
													item.image = 'user-content/item-images?id=' + item.id;
													item.save();
												}
											});
										});
									}

									ItemsModel.update({
										id: req.body.data.item.id,
										owner: req.user.id
									}, {
										$set: {
											name: req.body.data.item.name,
											description: req.body.data.item.description,
											price: req.body.data.item.price,
											quantity: req.body.data.item.quantity,
											instructions: req.body.data.item.instructions,
											forSale: req.body.data.item.forSale
										}
									}, function() {
										return res.send({
											success: true
										});
									});
								} else {
									return res.send(result);
								}
							});
							break;
						case 'buy':
							var taxRate = config.tax.rate;

							if (req.user.taxExempt) {
								taxRate = 0;
							}

							var continue_purchase = function() {
								ItemsModel.findOne({
									id: req.body.data.item.id,
									forSale: true,
									quantity: {
										$gte: req.body.data.quantity
									}
								}).lean().exec(function(err, item) {
									var quantity = req.body.data.quantity;

									if (quantity < 1) {
										return res.send({
											success: false,
											message: 'Invalid quantity'
										});
									}

									if (!item) {
										return res.send({
											success: false,
											message: 'Could not find item'
										});
									}

									if (item.owner === req.user.id) {
										return res.send({
											success: false,
											message: 'You can\'t buy your own item'
										});
									}

									var getTax = function(amount) {
										return Math.ceil(parseFloat(amount * quantity) * taxRate * 100) / 100;
									};
									var getTotal = function(amount) {
										return getTax(amount) + (amount * quantity);
									};

									if (req.user.balance / 100 >= getTotal(item.price)) {

										UsersModel.update({
											id: req.user.id
										}, {
											$inc: {
												balance: getTotal(item.price) * -100
											}
										}, function() {
											UsersModel.update({
												id: market.id
											}, {
												$inc: {
													balance: getTax(item.price) * 100
												}
											}, function() {
												UsersModel.update({
													id: item.owner
												}, {
													$inc: {
														balance: item.price * 100
													}
												}, function() {
													if (taxRate > 0) {
														var tax_transaction = new TransactionsModel({
															from: req.user.id,
															to: market.id,
															amount: getTax(item.price),
															memo: (taxRate * 100) + '% automatic tax',
															date: Date.now(),
															generated: true
														});
														tax_transaction.save();
													}
													if (item.price > 0) {
														var user_transaction = new TransactionsModel({
															from: req.user.id,
															to: item.owner,
															amount: item.price,
															memo: 'Purchase of ' + item.name,
															date: Date.now(),
															generated: true
														});
														user_transaction.save();
													}

													ItemsModel.update({
														id: item.id
													}, {
														$inc: {
															quantity: -1 * req.body.data.quantity
														}
													}, function() {
														var receipt = new ReceiptsModel({
															id: getUniqueId('receipt'),
															proof: getShortId(),
															buyer: req.user.id,
															seller: item.owner,
															date: Date.now(),
															item: {
																name: item.name,
																quantity: req.body.data.quantity,
																description: item.description,
																instructions: item.instructions
															}
														});
														receipt.save();

														logger.info(displayUser(req.user.username, req.user.bankid) + ' purchased item \'' + item.name + '\' (@' + item.quicklink + ')');
														return res.send({
															success: true,
															message: 'Item purchased, view your proof of purchase on the \"Receipts\" page'
														});
													});
												});
											});
										});
									} else {
										return res.send({
											success: false,
											message: 'Not enough funds in your account'
										});
									}
								});
							}

							continue_purchase();
							break;
						case 'quicklink':
							if (req.body.data.link) {
								req.body.data.link = req.body.data.link.toLowerCase().trim();
								if (req.body.data.link.substring(0, 1) === '@') {
									req.body.data.link = req.body.data.link.substring(1);
								}
								QuicklinksModel.findOne({
									link: req.body.data.link
								}).lean().exec(function(err, quicklink) {
									if (quicklink) {
										if (quicklink.item) {
											ItemsModel.findOne({
												id: quicklink.item,
												forSale: true
											}).lean().exec(function(err, item) {
												if (item) {
													quicklink.item = item;
													userById(item.owner, function(err, user) {
														if (err) {
															return res.send({
																success: false,
																message: 'Could not convert item owner ID to username'
															});
														}
														quicklink.item.owner = user.
														username;
														return res.send({
															success: true,
															quicklink: quicklink
														});
													});
												} else {
													return res.send({
														success: false,
														message: 'Linked item does not exist'
													});
												}
											});
										} else if (quicklink.payment) {
											return res.send({
												success: true,
												quicklink: quicklink
											});
										} else {
											return res.send({
												success: false,
												message: 'Quicklink contains no data'
											});
										}
									} else {
										return res.send({
											success: false,
											message: 'Could not find quicklink with specified name'
										});
									}

								});
							}
							break;
						case 'account-password':
							if (req.body.data.password) {
								password_hasher(req.body.data.password).hash(function(err, hash) {
									if (err) {
										logger.error(err);
										return res.send({
											success: false,
											message: 'Could not hash provided password'
										});
									} else {
										UsersModel.update({
											id: req.user.id
										}, {
											password: hash
										}, function() {
											res.send({
												success: true
											});
										});
									}
								});
							} else {
								return res.send({
									success: false,
									message: 'No password provided'
								});
							}
							break;
						case 'account-username':
							if (req.body.data.username) {
								logger.debug(displayUser(req.user.username, req.user.bankid) + ' is trying to change their username to ' + quote(req.body.data.username));
								if (req.body.data.username.toLowerCase() === req.user.username_lower) {
									req.user.username = req.body.data.username;
									req.user.username_lower = req.body.data.username.toLowerCase();
									req.user.save();
									return res.send({
										success: true
									});
								}
								isValidUsername(req.body.data.username, function(result) {
									if (result.success) {
										logger.info(displayUser(req.user.username, req.user.bankid) + ' changed their username to ' + quote(req.body.data.username));
										req.user.username = req.body.data.username;
										req.user.username_lower = req.body.data.username.toLowerCase();
										req.user.save();
									} else {
										logger.debug(displayUser(req.user.username, req.user.bankid) + ' username change to ' + quote(req.body.data.username) + ' failed');
									}
									return res.send(result);
								});
							} else {
								return res.send({
									success: false,
									message: 'No username provided'
								});
							}
							break;
						case 'find-edit':
							if (checkIsAdmin(req.user.bankid)) {
								if (req.body.data.id) {
									UsersModel.findOne({
										id: req.body.data.id
									}).exec(function(err, user) {
										if (!user) {
											return res.send({
												success: false,
												message: 'Could not find user'
											});
										}

										if (req.body.data.newValues.username) {
											user.username = req.body.data.newValues.username;
											user.username_lower = req.body.data.newValues.username.toLowerCase();
										}
										if (req.body.data.newValues.bankid) {
											user.bankid = req.body.data.newValues.bankid;
										}
										if (!isNaN(req.body.data.newValues.balance)) {
											user.balance = req.body.data.newValues.balance * 100;
										}
										if (req.body.data.newValues.tagline) {
											user.tagline = req.body.data.newValues.tagline;
										}
										user.trusted = req.body.data.newValues.trusted;
										user.taxExempt = req.body.data.newValues.taxExempt;
										if (req.body.data.newValues.password) {
											password_hasher(req.body.data.newValues.password).hash(function(err, hash) {
												if (err) {
													logger.error(err);
													return res.send({
														success: false,
														message: 'Could not hash provided password'
													});
												} else {
													user.password = hash;
													user.save();
												}
											})
										}

										user.save();
										return res.send({
											success: true
										});
									});
								}
							} else {
								logger.warn(displayUser(req.user.username, req.user.bankid) + ' (at ' + req.ip + ') tried to edit a user but is not an admin');
								res.send({
									success: false,
									message: 'You are not an admin! This violation has been logged'
								});
							}
							break;
						case 'find-delete':
							if (checkIsAdmin(req.user.bankid)) {
								if (req.body.data.id) {
									UsersModel.findOne({
										id: req.body.data.id
									}).exec(function(err, user) {
										if (user) {
											logger.info('Admin ' + displayUser(req.user.username, req.user.bankid) + ' deleted user ' + displayUser(user.username, user.bankid));
											deleteUser(user, function() {
												return res.send({
													success: true
												});
											});
										} else {
											return res.send({
												success: false,
												message: 'Could not find user'
											});
										}
									});
								}
							} else {
								logger.warn(displayUser(req.user.username, req.user.bankid) + ' (at ' + req.ip + ') tried to delete a user but is not an admin');
								res.send({
									success: false,
									message: 'You are not an admin! This violation has been logged'
								});
							}

					}
				} else {
					res.send(null);
				}
			});

			app.post('/api/send', function(req, res) {
				var payment = req.body;

				var sender = req.user;
				var recipient;

				var taxRate = config.tax.rate;

				if (req.user.taxExempt) {
					taxRate = 0;
				}

				if (payment.to.substring(0, 1) === '#') {
					userByBankId(payment.to.substring(1), function(err, data) {
						if (err || !data) {
							return res.send({
								success: false,
								message: 'User with Bank ID ' + payment.to + ' could not be found'
							})
						} else {
							recipient = data;
							continue_sending();
						}
					});
				} else {
					userByUsername(payment.to, function(err, data) {
						if (err || !data) {
							return res.send({
								success: false,
								message: 'User with username ' + quote(payment.to) + ' could not be found'
							});
						} else {
							recipient = data;
							continue_sending();
						}
					});
				}

				var continue_sending = function() {
					var getTax = function(amount) {
						return Math.ceil(parseFloat(amount) * taxRate * 100) / 100;
					};
					var getTotal = function(amount) {
						return getTax(amount) + amount;
					};
					if (sender.id === recipient.id) {
						return res.send({
							success: false,
							message: 'You can\'t send money to yourself!'
						});
					}

					var valid_amount = function(amount) {
						if (amount && amount.toString().indexOf('.') > -1) {
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
					var valid_memo = function(memo) {
						var minimum_length = 0;
						var maximum_length = 32;
						if (memo < minimum_length || memo > maximum_length) {
							return false;
						} else {
							return true;
						}
					};

					if (valid_memo(payment.memo)) {
						if (valid_amount(payment.amount)) {
							if (payment.amount > 0) {
								if (sender.balance / 100 >= getTotal(payment.amount)) {
									transferMoney({
										sender: sender.id,
										recipient: market.id,
										amount: getTax(payment.amount),
										memo: (taxRate * 100) + '% automatic tax',
										generated: true

									}, function() {
										transferMoney({
											sender: sender.id,
											recipient: recipient.id,
											amount: payment.amount,
											memo: payment.memo,
											generated: false
										}, function() {
											logger.info(displayUser(sender.username, sender.bankid) + ' sent ' + displayCurrency(payment.amount) + ' to ' + displayUser(recipient.username, recipient.bankid));
											return res.send({
												success: true,
												message: displayCurrency(payment.amount) + ' was sent to ' + recipient.username + ' (#' + recipient.bankid + ')'
											});
										});
									});

								} else {
									return res.send({
										success: false,
										message: 'Not enough funds in your account'
									});
								}
							} else {
								return res.send({
									success: false,
									message: 'You must send some money'
								});
							}
						} else {
							return res.send({
								success: false,
								message: 'Invalid amount'
							});
						}
					} else {
						return res.send({
							success: false,
							message: 'Invalid memo'
						});
					}
				};
			});

			var unknown_user_name = '[ Deleted User ]';
			app.get('/api/user', function(req, res) {
				res.set('Content-Type', 'text/json');

				if (req.user) {
					var response = {};

					var taxRate = config.tax.rate;
					if (req.user.taxExempt) {
						taxRate = 0;
					}

					var fields = [];
					if (req.query.fields) {
						fields = req.query.fields.toLowerCase().split(',');
					} else {
						response = {
							username: req.user.username,
							bankid: req.user.bankid,
							balance: req.user.balance / 100,
							tagline: req.user.tagline,
							taxRate: taxRate,
							isAdmin: checkIsAdmin(req.user.bankid),
							trusted: req.user.trusted,
							taxExempt: req.user.taxExempt
						};
					}


					for (var i in fields) {
						switch (fields[i]) {
							case 'username':
								response.username = req.user.username;
								break;
							case 'bankid':
								response.bankid = req.user.bankid;
								break;
							case 'balance':
								response.balance = req.user.balance / 100;
								break;
							case 'tagline':
								response.tagline = req.user.tagline;
								break;
							case 'taxrate':
								response.taxRate = taxRate;
								break;
							case 'isadmin':
								response.isAdmin = checkIsAdmin(req.user.bankid);
								break;
							case 'trusted':
								response.trusted = req.user.trusted;
								break;
							case 'taxexempt':
								response.taxExempt = req.user.taxExempt;
								break;
						}
					}
					res.send(response);
				} else {
					res.send(null);
				}
			});
			app.get('/api/buy', function(req, res) {
				res.set('Content-Type', 'text/json');

				var limit = null;
				if (req.query.limit !== undefined) {
					limit = parseInt(req.query.limit);
				}
				var skip = 0;
				if (req.query.skip !== undefined) {
					skip = parseInt(req.query.skip);
				}
				ItemsModel.find({
					forSale: true,
					quantity: {
						$gt: 0
					}
				}).skip(skip).limit(limit).select('-instructions').lean().exec(function(err, data) {
					var synchronouslyConvertIdToUsername = function(data, index, callback) {
						if (data.length > 0) {
							userById(data[index].owner, function(err, user) {
								if (user) {
									data[index].owner = user.username;
								} else {
									data[index].owner = unknown_user_name;
								}
								if (index < (data.length - 1)) {
									synchronouslyConvertIdToUsername(data, index + 1, callback);
								} else {
									callback(data);
								}
							});

						} else {
							callback(data);
						}
					};
					if (data.length) {
						synchronouslyConvertIdToUsername(data, 0, function(result) {
							res.send(result);
						});
					} else {
						res.send([]);
					}
				});
			});
			app.get('/api/items', function(req, res) {
				res.set('Content-Type', 'text/json');

				if (req.user) {
					var limit = null;
					if (req.query.limit !== undefined) {
						limit = parseInt(req.query.limit);
					}
					var skip = 0;
					if (req.query.skip !== undefined) {
						skip = parseInt(req.query.skip);
					}
					ItemsModel.find({
						owner: req.user.id
					}).skip(skip).limit(limit).lean().exec(function(err, data) {
						if (data) {
							res.send(data);
						} else {
							res.send([]);
						}
					});
				} else {
					res.send(null);
				}
			});
			app.get('/api/users', function(req, res) {
				res.set('Content-Type', 'text/json');

				var limit = null;
				if (req.query.limit !== undefined) {
					limit = parseInt(req.query.limit);
				}
				var skip = 0;
				if (req.query.skip !== undefined) {
					skip = parseInt(req.query.skip);
				}
				UsersModel.find({}).sort({
					balance: -1
				}).skip(skip).limit(limit).select('id username bankid tagline balance trusted taxExempt').lean().exec(function(err, data) {
					if (data) {
						for (var i in data) {
							data[i].balance = data[i].balance / 100;
						}
						res.send(data);
					} else {
						res.send([]);
					}
				});
			});
			app.get('/api/transactions', function(req, res) {
				res.set('Content-Type', 'text/json');

				var limit = null;
				if (req.query.limit !== undefined) {
					limit = parseInt(req.query.limit);
				}
				var skip = 0;
				if (req.query.skip !== undefined) {
					skip = parseInt(req.query.skip);
				}

				if (req.user) {
					TransactionsModel.find({
						$or: [{
							from: req.user.id
						}, {
							to: req.user.id
						}]
					}).skip(skip).limit(limit).sort({
						date: -1
					}).lean().exec(function(err, data) {
						if (data) {
							var synchronouslyConvertIdToUsername = function(data, index, callback) {
								if (data.length > 0) {
									data[index].date = new Date(data[index].date).toString();

									userById(data[index].from, function(err, user) {
										if (user) {
											data[index].from = {};
											data[index].from.username = user.username;
											data[index].from.bankid = user.bankid;
										} else {
											data[index].from = {};
											data[index].from.username = unknown_user_name;
											data[index].from.bankid = unknown_user_name;
										}
										userById(data[index].to, function(err, user) {
											if (user) {
												data[index].to = {};
												data[index].to.username = user.username;
												data[index].to.bankid = user.bankid;
											} else {
												data[index].to = {};
												data[index].to.username = unknown_user_name;
												data[index].to.bankid = unknown_user_name;
											}
											if (index < (data.length - 1)) {
												synchronouslyConvertIdToUsername(data, index + 1, callback);
											} else {
												callback(data);
											}
										});

									});

								} else {
									callback(data);
								}
							};
							synchronouslyConvertIdToUsername(data, 0, function(transactions) {
								res.send(transactions);
							});
						} else {
							res.send([]);
						}
					});
				} else {
					res.send(null);
				}
			});
			app.get('/api/receipts', function(req, res) {
				res.set('Content-Type', 'text/json');

				var limit = null;
				if (req.query.limit !== undefined) {
					limit = parseInt(req.query.limit);
				}
				var skip = 0;
				if (req.query.skip !== undefined) {
					skip = parseInt(req.query.skip);
				}

				if (req.user) {
					ReceiptsModel.find({
						$or: [{
							buyer: req.user.id
						}, {
							seller: req.user.id
						}]
					}).skip(skip).limit(limit).sort({
						date: -1
					}).lean().exec(function(err, data) {
						var synchronouslyConvertIdToUsername = function(data, index, callback) {
							if (data.length > 0) {
								data[index].date = new Date(data[index].date).toString();

								userById(data[index].seller, function(err, user) {
									if (user) {
										data[index].seller = {};
										data[index].seller.username = user.username;
										data[index].seller.bankid = user.bankid;
									} else {
										data[index].seller = {};
										data[index].seller.username = unknown_user_name;
										data[index].seller.bankid = unknown_user_name;
									}
									userById(data[index].buyer, function(err, user) {
										if (user) {
											data[index].buyer = {};
											data[index].buyer.username = user.username;
											data[index].buyer.bankid = user.bankid;
										} else {
											data[index].buyer = {};
											data[index].buyer.username = unknown_user_name;
											data[index].buyer.bankid = unknown_user_name;
										}
										if (index < (data.length - 1)) {
											synchronouslyConvertIdToUsername(data, index + 1, callback);
										} else {
											callback(data);
										}
									});

								});

							} else {
								callback(data);
							}
						};
						synchronouslyConvertIdToUsername(data, 0, function(receipts) {
							res.send(receipts);
						});
					});
				} else {
					res.send(null);
				}
			});
			app.get('/api/admin/logs', function(req, res) {
				if (req.user) {
					if (checkIsAdmin(req.user.bankid)) {
						if (req.query.lines !== undefined) {
							var number_of_lines = parseInt(req.query.lines);

							var lines = [];

							var LineByLineReader = require('line-by-line');
							var lr = new LineByLineReader('logs/' + config.logger.filename);

							lr.on('line', function(line) {
								lines.push(line);
							});

							lr.on('end', function() {
								res.set('Content-Type', 'text/json');
								res.send(lines.slice(0, number_of_lines));
							});
						} else {
							res.set('Content-Type', 'text/plain');
							res.sendFile(__dirname + '/logs/' + config.logger.filename);
						}

					} else {
						logger.warn(displayUser(req.user.username, req.user.bankid) + ' (at ' + req.ip + ') requested the admin logs but is not an admin');
						res.send(null);
					}
				} else {
					res.send(null);
				}
			});

			app.get('/signout', function(req, res) {
				if (req.user) {
					logger.info(displayUser(req.user.username, req.user.bankid) + ' signed out from ' + req.ip);
					req.logout();
				}
				res.redirect('/signin');
			});

			app.get('/user-content/item-images', function(req, res) {
				if (req.user) {
					ItemsModel.findOne({
						id: req.query.id,
						$or: [{
							forSale: true
						}, {
							owner: req.user.id
						}],
					}).lean().exec(function(err, item) {
						if (item) {
							var image_url = __dirname + '/user-content/item-images/' + item.id;
							fs.stat(image_url, function(err, stat) {
								if (err === null) {
									return res.sendFile(image_url);
								} else {
									logger.warn(displayUser(req.user.username, req.user.bankid) + ' requested image ' + req.query.id + ' but an error occurred, error code: ' + err.code);
									return res.sendFile(__dirname + '/webcontent/img/not-found.jpg');
								}
							});
						} else {
							return res.sendFile(__dirname + '/webcontent/img/not-found.jpg');
						}
					});
				} else {
					res.set('Content-Type', 'text/json');
					return res.send('Permission denied');
				}
			});

			var web_server_started = false;

			var market_ready = function() {
				var is_ready = false;
				var check = function() {
					logger.trace('Checking if startup is complete...');
					if (!is_ready) {
						// mongoose connection should be open and webserver should be started to be considered ready
						if ((mongoose.connection.readyState === 1) && (web_server_started) && (market)) {
							logger.trace('Startup is complete!');
							is_ready = true;
							logger.debug('Startup time was ' + (Date.now() - start_time) / 1000 + ' sec');
							logger.info('Market app ready');
						} else {
							logger.trace('Startup was not complete, checking again in 1 second...');
							setTimeout(check, 1000);
						}
					}
				};
				check();
			};

			var https_options;
			if (config.https.enabled) {
				https_options = {
					key: fs.readFileSync(config.https.key),
					cert: fs.readFileSync(config.https.cert),
					ciphers: 'HIGH'
				};
			}

			if ((config.port.http === config.port.https) && (config.https.enabled)) {
				var httpolyglot = require('httpolyglot');
				httpolyglot_server = httpolyglot.createServer(https_options, app);
				httpolyglot_server.listen(config.port.https, function() {
					web_server_started = true;
					logger.debug('App listening on port ' + config.port.https + ' (http and https)');
					market_ready();
				});
			} else {
				var http = require('http');
				var http_server = http.createServer(app);
				http_server.listen(config.port.http, function() {
					if (!config.https.enabled) {
						web_server_started = true;
					}
					logger.debug('App listening on port ' + config.port.http + ' (http)');
					market_ready();
				});

				if (config.https.enabled) {
					var https = require('https');
					var https_server = https.createServer(https_options, app);
					https_server.listen(config.port.https, function() {
						web_server_started = true;
						logger.debug('App listening on port ' + config.port.https + ' (https)');
						market_ready();
					});
				}
			}
		});
	};

	logger.trace('Market app instantiated');
};

module.exports.createApp = function(config) {
	return new app(config);
};