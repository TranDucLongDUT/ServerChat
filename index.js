let express = require("express");
let app = express();
let server = require("http").createServer(app);
let io = require("socket.io").listen(server);
server.listen(3000);
//Mysql config
let mysql = require('mysql');
let con = mysql.createConnection({
    host: "localhost",
    user: "root",
    database: "simpleChat"
});

con.connect(function (err) {
    if (err) {
        console.log(err)
    } else {
        console.log("connected!!!");
    }
});
//socket
let clients = {};
io.sockets.on('connection', function (socket) {
    let userId = socket.handshake.query.token;
    console.log("user %s connected", userId);
    clients[userId] = {
        "socket": socket.id
    };
    let sql = 'SELECT Rooms.id FROM Rooms INNER JOIN RoomUsers ON Rooms.id = RoomUsers.idRoom WHERE RoomUsers.idUser = ?';
    let param = [userId];
    con.query(sql, param, function (err, result) {
       result.forEach(room => {
           console.log(userId + ' join to ' + room.id);
           socket.join(room.id);
       });
    });

    socket.on('sendMessage', function (data) {
        socket.broadcast.to(data.roomId).emit("receiverMessage", data);
    });

    socket.on('call', function (data) {
        /*if (clients[data.roomId]) {
            io.sockets.connected[clients[data.roomId].socket].emit("call", {
                "roomId": userId
            });
        }*/
        socket.broadcast.to(data.roomId).emit("call", data);
    });

    socket.on('callContent', function (data) {
        /*if (clients[data.roomId]) {
            io.sockets.connected[clients[data.roomId].socket].emit("callContent", data);
        }*/
        socket.broadcast.to(data.roomId).emit("callContent", data);
    });

    socket.on('callAccept', function (data) {
        /*if (clients[data.roomId]) {
            io.sockets.connected[clients[data.roomId].socket].emit("callAccept", data);
        }*/
        socket.broadcast.to(data.roomId).emit("callAccept", data);
    });

    socket.on('callStop', function (data) {
        /*if (clients[data.roomId]) {
            io.sockets.connected[clients[data.roomId].socket].emit("callStop", data);
        }*/
        socket.broadcast.to(data.roomId).emit("callStop", data);
    });

    //Removing the socket on disconnect
    socket.on('disconnect', function () {
        for (let name in clients) {
            if (clients[name].socket === socket.id) {
                delete clients[name];
                break;
            }
        }
    });
});

//Api
let bodyParser = require('body-parser');
app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));
let body = {};
app.post('/user/login', function (req, res) {
    let sql = 'SELECT id, firstName, lastName, createdAt FROM User WHERE userName = ? and password = ?';
    let param = [req.body.userName, req.body.password];
    con.query(sql, param, function (err, result) {
        //console.log(result);
        if (result != null && result != '') {
            body.status = 200;
            body.message = 'Success';
            body.data = result[0];
            res.send(body);
        } else {
            body.status = 201;
            body.message = 'userName or password is wrong';
            body.data = null;
            res.send(body);
        }
    });
});

app.post('/user/register', function (req, res) {
    let sql = 'SELECT * FROM User WHERE userName = ?';
    let param = [req.body.userName];
    con.query(sql, param, function (err, result) {
        if (result == null || result == '') {
            sql = 'INSERT INTO User (userName, password, firstName, lastName) VALUES (?, ?, ?, ?)';
            param = [req.body.userName, req.body.password, req.body.firstName, req.body.lastName];
            con.query(sql, param, function (err, result) {
                if (err) {
                    body.status = 201;
                    body.message = err;
                    body.data = null;
                    res.send(body);
                } else {
                    body.status = 200;
                    body.message = 'Success';
                    body.data = {
                        'id': result.insertId
                    };
                    res.send(body);
                }
            });
        } else {
            console.log(result);
            body.status = 201;
            body.message = 'Duplicate userName';
            body.data = null;
            res.send(body);
        }
    });
});

/**
 * [
 *  {
 *      "roomId": 1,
 *      "users": [
 *          {
 *              "id" : 5,
 *              "userName" : "dungpv",
 *              "firstName" : "Pham",
 *              "lastName" : "Dung"
 *          }
 *      ]
 *  }
 * ]
 */
app.get('/rooms', async function (req, res) {
    let sql = 'SELECT Rooms.id FROM Rooms INNER JOIN RoomUsers ON Rooms.id = RoomUsers.idRoom WHERE RoomUsers.idUser = ?';
    let param = [req.headers.authorization];
    let result = await query(sql, param);
    let rooms = [];
    const roomIds = result.map(room => room.id);
    sql = 'SELECT User.id, User.userName, User.firstName, User.lastName FROM User INNER JOIN RoomUsers ON User.id = RoomUsers.idUser WHERE RoomUsers.idRoom = ?';
    for (let i = 0; i < roomIds.length; i++) {
        param = [roomIds[i]];
        let users = await query(sql, param);
        let room = {
            "roomId": roomIds[i],
            'users': users
        };
        rooms.push(room);
    }
    body.status = 200;
    body.message = 'Success';
    body.data = {
        'rooms' : rooms
    };
    res.send(body);
});

app.post('/room', function (req, res) {
    let sql = 'INSERT INTO Rooms (roomName) VALUES (?)';
    let param = [req.body.roomName];
    con.query(sql, param, function (err, result) {
        let roomId = result.insertId;
        let sender = req.headers.authorization;
        let userIds = req.body.ids;
        userIds.push(sender);
        param = userIds.map(id => {
            return [
                parseInt(id),
                roomId
            ]
        });
        userIds.forEach(id => {
            if (clients[id]) {
                io.sockets.connected[clients[id].socket].join(roomId);
            }
        });
        sql = 'INSERT INTO RoomUsers (idUser, idRoom) VALUES ?';
        con.query(sql, [param]);
        body.status = 200;
        body.message = 'Success';
        body.data = {
            'roomId' : roomId
        };
        res.send(body);
    });

});

function query(sql, param) {
    return new Promise((resolve, reject) => {
        con.query(sql, param, function (err, result) {
            if(err) {
                reject(err);
            }
            resolve(result);
        });
    })
}