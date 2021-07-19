const net = require('net');
const { EventEmitter } = require('events');

class NetClient extends EventEmitter {
    static connections = new Map();
    static connectionCount = {};

    static getConnection(key, id, port, host = '127.0.0.1') {
        NetClient.connectionCount[key] =
            NetClient.connectionCount[key] || new Set();

        NetClient.connectionCount[key].add(id);

        if (NetClient.connections.has(key)) {
            return NetClient.connections.get(key);
        }

        const connection = net.createConnection({ port, host });

        NetClient.connections.set(key, connection);

        return connection;
    }

    static endConnection(key, id) {
        NetClient.connectionCount[key].delete(id);

        if (NetClient.connectionCount[key].size === 0) {
            if (NetClient.connections.has(key)) {
                let connection = NetClient.connections.get(key);
                connection.destroy();
                NetClient.connections.delete(key);
                connection = null;
            }
        }
    }

    activateNext() {
        if (this.errored) {
            return;
        }

        if (this.connection) {
            return;
        }

        this.options.id = this.id;
        this.options.key = this.key;
        this.options.port = this.port;
        this.options.host = this.host;

        this.ready = false;
        this.errored = false;

        this.connectionData = this.connectionData.bind(this);
        this.connectionEnd = this.connectionEnd.bind(this);
        this.connectionError = this.connectionError.bind(this);
        this.handler = this.handler.bind(this);

        this.connection = NetClient.getConnection(
            this.options.key,
            this.options.id,
            this.options.port
        );

        this.connection.on('error', this.connectionError);
        this.connection.on('data', this.connectionData);
        this.connection.on('end', this.connectionEnd);

        this.show();
    }

    handler(data) {
        return JSON.parse(data.toString());
    }

    connectionData(data) {
        if (this.errored) {
            return;
        }

        try {
            const handled = this.handler(data);
            this.emit('connection data', handled, data);
        } catch (err) {}

        this.ready = true;
        this.active = true;
    }

    connectionError(err) {
        this.errored = true;
        this.emit('connection error', err);
        this.cleanConnection();
    }

    connectionEnd(err) {
        this.emit('connection end', err);
        this.cleanConnection();
    }

    cleanConnection() {
        if (this.connection) {
            this.connection.removeListener('end', this.connectionEnd);
            this.connection.removeListener('error', this.connectionError);
            this.connection.removeListener('data', this.connectionData);

            NetClient.endConnection(this.options.key, this.options.id);
            this.connection = null;
        }

        this.active = false;
    }
}

module.exports = NetClient;
