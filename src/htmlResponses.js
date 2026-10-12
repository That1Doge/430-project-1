const fs = require('fs');

const index = fs.readFileSync(`${__dirname}/../client/index.html`);
const css = fs.readFileSync(`${__dirname}/../client/style.css`);
const clientJS = fs.readFileSync(`${__dirname}/../client/client.js`);
const docs = fs.readFileSync(`${__dirname}/../client/docs.html`);

const sendFile = (request,response,type,content) => {
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length });
    if(request.method !== 'HEAD') {
        response.write(content);
    }
    response.end();
};

const getIndex = (request,response) => sendFile(request,response,'text/html',index);
const getCSS = (request,response) => sendFile(request,response,'text/css',css);
const getClientJS = (request,response) => sendFile(request,response,'text/javascript',clientJS);
const getDocs = (request,response) => sendFile(request,response,'text/html',docs);

module.exports = {
    getIndex,
    getCSS,
    getClientJS,
    getDocs,
};