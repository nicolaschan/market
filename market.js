var market = function(config) {
	this.config = {
		"taxRate": 0.05,
		"adminId": "market",
		"port": 8080,
		"database": "mongodb://localhost/market",
		"logger": {
			"filename": "main.log",
			"level": "ALL"
		}
	};
	for (var key in config) {
		this.config.key = config.key;
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

	this.start = function() {
		logger.info('Starting market app...');
		logger.debug('Logging at level: ' + logger.level.levelStr);

		var mongoose = require('mongoose'),
			Schema = mongoose.Schema,
			conn = mongoose.connection;

		mongoose.connect(config.database);

		var fs = require('fs');

		conn.once('open', function() {
			logger.debug('Database connection open to ' + config.database);

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
				selling: Array,
				shops: Array,
				friends: Array,
				unreadMessagesNumber: Number,
				tagline: String
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

			var uuid = require('node-uuid');
			var getUniqueId = function(prefix) {
				return prefix + '-' + uuid.v1();
			};

			var password_hasher = require('password-hash-and-salt');

			var UserModel = mongoose.model('user', usersSchema);
			var ItemsModel = mongoose.model('items', itemsSchema);
			var TransactionsModel = mongoose.model('transactions', transactionsSchema);
			var QuicklinksModel = mongoose.model('quicklinks', quicklinksSchema);

			var displayUser = function(username, bankid) {
				return username + ' (#' + bankid + ')';
			};

			var idToUsername = function(id, callback) {
				UserModel.findOne({
					id: id
				}).lean().exec(function(err, data) {
					callback(data.username);
				});
			};

			var isValidUsername = function(username, result) {
				var minimum_length = 3;
				var maximum_length = 16;
				if (!/^[a-zA-Z0-9_]*$/g.test(username)) {
					return result({
						success: false,
						message: 'Username may only contain letters, numbers, and underscore'
					});
				}
				if (username.length < minimum_length && username.length > maximum_length) {
					return result({
						success: false,
						message: 'Username must be ' + minimum_length + ' to ' + maximum_length + ' characters long'
					});
				}

				UserModel.findOne({
					username: username
				}).lean().count(function(err, count) {
					if (count > 0) {
						return result({
							success: false,
							message: 'Username is taken'
						});
					} else {
						return result({
							success: true
						});
					}
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
							message: 'Username may only contain letters, numbers, and underscore'
						});
					}
					if (bankid.length < minimum_length && bankid.length > maximum_length) {
						return result({
							success: false,
							message: 'Username must be ' + minimum_length + ' to ' + maximum_length + ' characters long'
						});
					}

					UserModel.findOne({
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
					var user = new UserModel({
						id: getUniqueId('user'),
						username: credentials.username,
						username_lower: credentials.username.toLowerCase(),
						password: credentials.password_hash,
						bankid: credentials.bankid,
						balance: 10000000,
						selling: [],
						shops: [],
						friends: [],
						unreadMessagesNumber: 0,
						tagline: 'A market user'
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
					UserModel.findOne({
						bankid: username.substring(1).toLowerCase().trim()
					}, function(err, user) {
						if (err) {
							return done(err);
						}
						if (!user) {
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
								return done(null, false, {
									message: 'Incorrect username or password'
								});
							}
						});
					});
				} else {
					UserModel.findOne({
						username_lower: username.toLowerCase().trim()
					}, function(err, user) {
						if (err) {
							return done(err);
						}
						if (!user) {
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
				UserModel.findOne({
					id: id
				}, function(err, user) {
					done(err, user);
				});
			});
			app.use(passport.initialize());
			app.use(passport.session());

			var bodyParser = require('body-parser');
			app.use(bodyParser.json());
			app.use(bodyParser.urlencoded({
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

			app.post('/signin', passport.authenticate('local', {
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
							username: user_info.username,
							password_hash: hash,
							bankid: user_info.bankid
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
				var name_length_max = 64;
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
				UserModel.findOne({
					username_lower: username.toLowerCase()
				}).lean().exec(function(err, data) {
					callback(err, data)
				});
			};
			var userByBankId = function(bankid, callback) {
				UserModel.findOne({
					bankid: bankid.toLowerCase()
				}).lean().exec(function(err, data) {
					callback(err, data)
				});
			};
			var userById = function(id, callback) {
				UserModel.findOne({
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

			app.post('/', function(req, res) {
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
							var market;
							if (payment.to.substring(0, 1) === '#') {
								userByBankId(payment.to.substring(1), function(err, data) {
									if (err || !data) {
										return res.send({
											success: false,
											message: 'User with Bank ID ' + payment.to + ' could not be found'
										})
									} else {
										recipient = data;
										setMarket();
									}
								});
							} else {
								userByUsername(payment.to, function(err, data) {
									if (err || !data) {
										return res.send({
											success: false,
											message: 'User with username \"' + payment.to + '\" could not be found'
										});
									} else {
										recipient = data;
										setMarket();
									}
								});
							}
							var setMarket = function() {
								userByBankId(config.adminId, function(err, data) {
									if (err || !data) {
										return res.send({
											success: false,
											message: 'The tax entity could not be found, this is probably a configuration error'
										});
									} else {
										market = data;
										continue_sending();
									}
								});
							};

							var continue_sending = function() {
								var getTax = function(amount) {
									return Math.ceil(parseFloat(amount) * config.taxRate * 100) / 100;
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
												UserModel.update({
													id: sender.id
												}, {
													$inc: {
														balance: getTotal(payment.amount) * -100
													}
												}, function() {
													UserModel.update({
														id: market.id
													}, {
														$inc: {
															balance: getTax(payment.amount) * 100
														}
													}, function() {
														UserModel.update({
															id: recipient.id
														}, {
															$inc: {
																balance: payment.amount * 100
															}
														}, function() {
															if (config.taxRate > 0) {
																var tax_transaction = new TransactionsModel({
																	from: sender.id,
																	to: market.id,
																	amount: getTax(payment.amount),
																	memo: (config.taxRate * 100) + '% automatic tax',
																	date: Date.now(),
																	generated: true
																});
																tax_transaction.save();
															}
															var user_transaction = new TransactionsModel({
																from: sender.id,
																to: recipient.id,
																amount: payment.amount,
																memo: payment.memo,
																date: Date.now(),
																generated: false
															});
															user_transaction.save();

															logger.info(displayUser(sender.username, sender.bankid) + ' sent ' + displayCurrency(payment.amount) + ' to ' + displayUser(recipient.username, recipient.bankid));
															return res.send({
																success: true,
																message: displayCurrency(payment.amount) + ' was sent to ' + recipient.username + ' (#' + recipient.bankid + ')'
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
								var images = ['black', 'blue', 'green', 'purple', 'red', 'yellow'];
								var suffix = '.png';

								var random = require('random-to');
								return prefix + images[random.from0upto(images.length)] + suffix;
							};

							isValidItemInfo(req.body.data.item, function(result) {
								if (result.success) {
									getQuicklinkId(function(err, id) {
										if (err) {
											return res.send({
												success: false,
												message: 'Error generating quicklink link'
											});
										}
										var itemId = getUniqueId('item');
										var item = new ItemsModel({
											id: itemId,
											owner: req.user.id,
											name: req.body.data.item.name,
											description: req.body.data.item.description,
											price: req.body.data.item.price,
											quantity: req.body.data.item.quantity,
											instructions: req.body.data.item.instructions,
											image: getRandomImage(),
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
								} else {
									return res.send(result);
								}
							});

							break;
						case 'items-delete':
							ItemsModel.find({
								id: req.body.data.itemId,
								owner: req.user.id
							}).remove(function() {
								return res.send({
									success: true
								})
							});
							break;
						case 'items-edit':
							isValidItemInfo(req.body.data.item, function(result) {
								if (result.success) {
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
							var market;
							var setMarket = function() {
								userByBankId(config.adminId, function(err, data) {
									if (err || !data) {
										return res.send({
											success: false,
											message: 'The tax entity could not be found, this is probably a configuration error'
										});
									} else {
										market = data;
										continue_purchase();
									}
								});
							};

							var continue_purchase = function() {
								ItemsModel.findOne({
									id: req.body.data.item.id,
									forSale: true
								}).lean().exec(function(err, item) {
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
										return Math.ceil(parseFloat(amount) * config.taxRate * 100) / 100;
									};
									var getTotal = function(amount) {
										return getTax(amount) + amount;
									};

									if (req.user.balance / 100 >= getTotal(item.price)) {
										UserModel.update({
											id: req.user.id
										}, {
											$inc: {
												balance: getTotal(item.price) * -100
											}
										}, function() {
											UserModel.update({
												id: market.id
											}, {
												$inc: {
													balance: getTax(item.price) * 100
												}
											}, function() {
												UserModel.update({
													id: item.owner
												}, {
													$inc: {
														balance: item.price * 100
													}
												}, function() {
													if (config.taxRate > 0) {
														var tax_transaction = new TransactionsModel({
															from: req.user.id,
															to: market.id,
															amount: getTax(item.price),
															memo: (config.taxRate * 100) + '% automatic tax',
															date: Date.now(),
															generated: true
														});
														tax_transaction.save();
													}
													var user_transaction = new TransactionsModel({
														from: req.user.id,
														to: item.owner,
														amount: item.price,
														memo: 'Purchase of ' + item.name,
														date: Date.now(),
														generated: true
													});
													user_transaction.save();

													ItemsModel.findOne({
														id: item.id
													}).exec(function(err, item) {
														item.owner = req.user.id;
														item.forSale = false;
														item.save(function() {
															logger.info(displayUser(req.user.username, req.user.bankid) + ' purchased item \'' + item.name + '\' (@' + item.quicklink + ')');
															return res.send({
																success: true,
																message: 'Item purchased, view your items on the \"My Items\" page'
															});
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
							setMarket();
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
												id: quicklink.item
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
										UserModel.update({
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
					}
				} else {
					res.send(null);
				}
			});

			app.get('/data', function(req, res) {
				res.set('Content-Type', 'text/json');

				if (req.user) {
					switch (req.query.page) {
						case 'navbar':
							res.send({
								username: req.user.username,
								unreadMessagesNumber: req.user.unreadMessagesNumber,
								balance: req.user.balance / 100,
								taxRate: config.taxRate
							});
							break;
						case 'buy':
							var synchronouslyConvertIdToUsername = function(data, index, callback) {
								if (data.length > 0) {
									userById(data[index].owner, function(err, user) {
										data[index].owner = user.username;
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
							ItemsModel.find({
								forSale: true,
								owner: {
									$ne: req.user.id
								}
							}).select('-instructions').lean().exec(function(err, data) {
								if (data.length) {
									synchronouslyConvertIdToUsername(data, 0, function(result) {
										res.send({
											balance: req.user.balance / 100,
											taxRate: config.taxRate,
											items: result
										});
									});
								} else {
									res.send({
										balance: req.user.balance / 100,
										taxRate: config.taxRate,
										items: []
									});
								}

							});
							break;
						case 'sell':
							ItemsModel.find({
								owner: req.user.id
							}).lean().exec(function(err, data) {
								res.send(data)
							});
							break;
						case 'profile':
							res.send({
								username: req.user.username,
								bankid: req.user.bankid,
								databaseid: req.user.id,
								tagline: req.user.tagline
							});
							break;
						case 'find':
							UserModel.find({
								id: {
									$ne: req.user.id
								}
							}).sort({
								username: 1
							}).lean().exec(function(err, data) {
								res.send(data);
							});
							break;
						case 'balance':
							res.send({
								balance: req.user.balance / 100
							});
							break;
						case 'transactions':
							TransactionsModel.find({
								$or: [{
									from: req.user.id
								}, {
									to: req.user.id
								}]
							}).sort({
								date: -1
							}).lean().exec(function(err, data) {
								var synchronouslyConvertIdToUsername = function(data, index, callback) {
									if (data.length > 0) {
										data[index].date = new Date(data[index].date).toString();

										userById(data[index].from, function(err, user) {
											data[index].from = {};
											data[index].from.username = user.username;
											data[index].from.bankid = user.bankid;
											userById(data[index].to, function(err, user) {
												data[index].to = {};
												data[index].to.username = user.username;
												data[index].to.bankid = user.bankid;
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
									res.send({
										username: req.user.username,
										transactions: transactions
									});
								});
							});
							break;
						case 'send':
							res.send({
								taxRate: config.taxRate,
								balance: req.user.balance / 100
							});
							break;
					}
				} else {
					res.send(null);
				}
			});

			app.get('/signout', function(req, res) {
				logger.info(displayUser(req.user.username, req.user.bankid) + ' signed out from ' + req.ip);
				req.logout();
				res.redirect('/signin');
			});

			app.listen(config.port, function() {
				logger.debug('App listening on port ' + config.port);
				logger.info('Market app ready');
			});
		});
	};
	logger.trace('Market instance instantiated');
};

module.exports.market = market;