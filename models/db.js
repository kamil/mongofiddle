var mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;

var db_schema = new Schema({

    _id      : String,

    db_name : String,
    db_port : String,
    db_host : String,
    db_user : String,
    db_pass : String,

    commands : Array,
    last_command : Date,
    created      : { type: Date, default: Date.now }

});

module.exports = mongoose.model('dbs', db_schema)
