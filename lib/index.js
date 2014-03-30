var Connection = require('ssh2')
var constants = process.binding('constants')
var fs = require('fs')
var path = require('path')

function isDirectory(attrs) {
  return (attrs.mode & constants.S_IFMT) === constants.S_IFDIR
}

function SFTPTransport(options) {
  this.host = options.host
  this.port = options.port || 22
  this.username = options.username || process.env['USER']
  this.agent = options.agent || process.env['SSH_AUTH_SOCK']
  if (options.privateKey) {
    this.privateKey = fs.readFileSync(options.privateKey).toString()
  }
}

SFTPTransport.prototype.setup = function(callback) {
  var self = this

  function onSftpEnd() {
    self.logger.error('sftp connection closed unexpectedly')
  }

  function onConnectionEnd() {
    self.logger.error('ssh connection closed unexpectedly')
  }

  self.connection = new Connection()
  self.connection.on('ready', function() {
    self.logger.debug('ssh ready')
    self.connection.sftp(function(error, sftp) {
      self.sftp = sftp
      self.logger.debug('sftp open')
      self.sftp.on('error', function(error) {
        self.logger.error('sftp error', error)
      })
      self.sftp.on('end', onSftpEnd);
      callback(error)
    })
  })
  self.connection.on('end', onConnectionEnd)
  self.connection.on('error', callback)

  self.connection.connect({
    host: self.host,
    port: self.port,
    username: self.username,
    privateKey: self.privateKey,
    agent: self.agent
  })

  // references so we can remove the event listeners later
  self.__onSftpEnd = onSftpEnd
  self.__onConnectionEnd = onConnectionEnd
}

SFTPTransport.prototype.cleanup = function(callback) {
  this.sftp.removeListener('end', this.__onSftpEnd)
  this.connection.removeListener('end', this.__onConnectionEnd)
  //this.connection.on('end', callback)
  this.sftp.end()
  this.connection.end()
  callback()
}

SFTPTransport.prototype.listDirectory = function(dirname, callback) {
  var self = this
  self.sftp.opendir(dirname, function(error, handle) {
    if (error != null) {
      callback(error)
      return
    }
    self.sftp.readdir(handle, function(error, list) {
      var i, file, rv = []
      if (error == null) {
        for (i = 0; i < list.length; i++) {
          file = list[i]
          if (file.filename === '.' || file.filename === '..') {
            continue
          }
          if (isDirectory(file.attrs)) {
            rv.push(file.filename + '/')
          } else {
            rv.push(file.filename)
          }
        }
      }
      callback(error, rv)
    })
  })
}

SFTPTransport.prototype.makeDirectory = function(dirname, callback) {
  this.sftp.mkdir(dirname, callback)
}

SFTPTransport.prototype.deleteDirectory = function(dirname, callback) {
  this.sftp.rmdir(dirname, callback)
}

SFTPTransport.prototype.createReadStream = function(filename) {
  return this.sftp.createReadStream(filename)
}

SFTPTransport.prototype.putFile = function(filename, size, stream, callback) {
  var writeStream = this.sftp.createWriteStream(filename)
  writeStream.on('close', callback)
  writeStream.on('error', callback)
  stream.pipe(writeStream)
}

SFTPTransport.prototype.deleteFile = function(filename, callback) {
  this.sftp.unlink(filename, callback)
}

SFTPTransport.options = {
  host: {
    required: true,
    description: 'hostname'
  },
  port: {
    description: 'port (default: 22)'
  },
  privateKey: {
    description: 'path to private key'
  },
  username: {
    description: 'username (default: $USER)'
  },
  agent: {
    description: 'ssh agent socket (default: $SSH_AUTH_SOCK)'
  }
}

module.exports = SFTPTransport
