var express       = require('express');
var logger        = require('morgan');
var superagent    = require('superagent');
var fs            = require('fs');
var app           = express();

app.use(logger('dev'));
app.use(require('body-parser')());
app.use((req, res, next) => {
    req.config     = require('./config.json');
    req.getApiData = (url, data, callback) => {
        
        if(req.config.accessToken.trim() == '') return callback('请先绑定189电信账号');
        
        data['app_id'] = req.config.appKey
        data['access_token'] = req.config.accessToken;
        
        superagent.get(url).query(data).end((err, res) => {
            if(err) return callback(err);
            try {
                callback(null, JSON.parse(res.text));
            } catch (error) {
                callback(error);
            }
        });
    }
    next();
});

// OAuth 重定向
app.get('/auth', (req, res) => {
   var args = `response_type=token&app_id=${req.config.appKey}&
               app_secret=${req.config.appSecret}&redirect_uri=${req.config.callbackUrl}`;
   var authUrl  = `https://oauth.api.189.cn/emp/oauth2/v3/authorize?${args}`;
   res.redirect(authUrl);
});

// OAuth 回调
app.get('/authCallback/', (req, res) => {
    if(req.config.accessToken != '') return res.send('请先删除config.json accessToken值');
    
    var accessToken = req.query.access_token || '';
    var res_code = req.query.res_code || -1;

    if(accessToken == '' || res_code == -1) return res.send('回调参数不正确');
    
    if(res_code != 0) return res.send('认证失败 错误代码:' + res_code);
   
    req.config.accessToken = accessToken;
   
    fs.writeFile('config.json', JSON.stringify(req.config, null, 4), 'utf8', (err) => {
        res.send(`Save Status: ${err || '保存配置成功'} <br> Access Token: ${accessToken}`);
    });  
});

app.get('/', (req, res) => {
    fs.readFile('./list.html', 'utf8', (err, data) => {
        if(err) return res.status(503).send(`can't render html.`);
        res.send(data);
    });
});

app.get('/link/:fileId', (req, res) => {
    var fileId = req.params.fileId;
    req.getApiData('http://api.189.cn/ChinaTelecom/getFileDownloadUrl.action', {fileId: fileId}, (err, result) => {
        if(err) return res.status(503).send(err);
        res.redirect(result.fileDownloadUrl);
    });
});

app.get('/files/', (req, res) => {
    req.getApiData('http://api.189.cn/ChinaTelecom/listFiles.action', {}, (err, result) => {
        if(err) return res.status(503).send(err);
        res.json(result);
    })
});

app.get('/files/:folderId', (req, res) => {
    var folderId = req.params.folderId;
    req.getApiData('http://api.189.cn/ChinaTelecom/listFiles.action', {folderId: folderId}, (err, result) => {
        if(err) return res.status(503).send(err);
        res.json(result);
    })
});

app.listen(require('./config.json').port, (error) =>  {
    if(error) return console.error('监听端口发生错误:', error);
    console.log('服务已开启');
});