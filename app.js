var express       = require('express');
var logger        = require('morgan');
var superagent    = require('superagent');
var bodyParser    = require('body-parser');
var fs            = require('fs');
var app           = express();

var Cache = {};
setInterval(() => {
    Object.keys(Cache).forEach((key) => {
        var obj = Cache[key];
        obj.time--;
        if(obj.time <= 0) delete Cache[key];
    });
}, 1000);

app.use(logger('dev'));
app.use(bodyParser.urlencoded({ extended: false }))  
app.use(bodyParser.json())  
app.use((req, res, next) => {
    req.config     = require('./config.json');
    req.getApiData = (url, data, callback) => {
        if(req.config.accessToken.trim() == '') return callback('请先绑定189电信账号');
        
        data['app_id'] = req.config.appKey
        data['access_token'] = req.config.accessToken;
        
        superagent.get(url).query(data).timeout(1000 * 10).end((err, res) => {
            if(err) return callback(err);
            try {
                callback(null, JSON.parse(res.text));
            } catch (error) {
                callback(error);
            }
        });
    }
    
    req.setCache = (key, obj, time) => {
        Cache[key] = {time: time, data: obj}
    }
    req.getCache = (key) => {
        return Cache[key] ? Cache[key] : null;
    }
    
    next();
});

// OAuth 重定向
app.get('/auth', (req, res) => {
    var args = `response_type=token&app_id=${req.config.appKey}&app_secret=${req.config.appSecret}&redirect_uri=${req.config.callbackUrl}`;
    var authUrl  = `https://oauth.api.189.cn/emp/oauth2/v3/authorize?${args}`;
    res.send(`<a href="${authUrl}">跳转至天翼云</a>`);
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
    var cache = req.getCache(fileId);
    if(cache){
        res.set('Link-Cache', 'Hit ' + cache.time);
        return res.redirect(cache.data);
    }
    req.getApiData('http://api.189.cn/ChinaTelecom/getFileDownloadUrl.action', {fileId: fileId}, (err, result) => {
        if(err) return res.status(503).send(err);
        // 天翼云盘真实链接并不会立即过期，也许要过1天? 或者100年? 
        // 反正这里配置文件里默认缓存60分钟 因为我就试了60分钟 懒得试了 但是证实60分钟+还是有效的 
        // 如果电信修改了 请自行修改 config -> linkCacheTime
        if(req.config.linkCache) req.setCache(fileId, result.fileDownloadUrl, req.config.linkCacheTime);
        res.set('Link-Cache', 'Miss');
        res.redirect(result.fileDownloadUrl);
    });
});

app.get('/folder/', (req, res) => {
    // 天翼云API出现问题，会暴露全部文件夹和文件 所以在此加入设置默认文件夹ID
    req.getApiData('http://api.189.cn/ChinaTelecom/listFiles.action', req.config.defaultFolder == -1 ? {} : {folderId: req.config.defaultFolder}, (err, result) => {
        if(err) return res.status(503).send(err);
        res.json(result);
    })
});

app.get('/folder/:folderId', (req, res) => {
    var folderId = req.params.folderId;
    req.getApiData('http://api.189.cn/ChinaTelecom/listFiles.action', {folderId: folderId}, (err, result) => {
        if(err) return res.status(503).send(err);
        res.json(result);
    })
});

app.listen(require('./config.json').port, (error) =>  {
    if(error) return console.error('监听端口发生错误:', error);
    console.log('服务已开启 监听端口:' + require('./config.json').port);
});
