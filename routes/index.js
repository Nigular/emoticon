var express = require('express');
var path = require('path');
var _ = require('lodash');
var fs = require('fs');
var archiver = require('archiver');
var multer = require('multer');
var request = require("request");
var fs_ext = require('../utils/fs_ext')();
var router = express.Router();

var zipDir = path.join(path.resolve(__dirname,"../"), "zip");
var uploadDir = path.join(path.resolve(__dirname,"../"), "uploads");
var zipName = "emoticon.zip";

// 引入数据模块
var mainmodel = require("../database/mainmodel.js");

/* GET home page. */
router.get('/', function(req, res, next) {
	mainmodel.find({},function(data){
		console.log(data);
		res.render('index',{ listData: data});
	});
});

/* 管理员登录页 */
router.route("/login").get(function(req,res){
	res.render("login",{title:"用户登录"});  // 渲染login模板
}).post(function(req,res){
	var user = {username:"longer",password:"123456"};
	// 如果用户名和密码一致
	if(req.body.username===user.username && req.body.password === user.password ){
		req.session.user = user;  //登录成功，记录到session里
		res.redirect("/admin");	// 跳转到admin路由
	}else {
		req.session.error='用户名或密码不正确';
	    res.redirect("/login");		// 否则跳转到login路由
	}
});

router.get("/loginout",function(req,res){
	req.session.user = null;  //退出后，清空session里的值
	res.redirect("/");
});

/* 后台页面 */
router.route("/admin").get(function(req,res){
	authentication(req, res);	// 先验证是否存在session
	
	res.render("admin",{title:"管理后台"});  // 渲染login模板
});

/* 录入表情地址  */
router.route("/entering").post(function(req,res){
	var addData={
		emtName:req.body.emtName,
	    emtRoot: req.body.emtRoot,
	    emtCount: req.body.emtCount,
	    imgType: req.body.imgType
	}
	mainmodel.addone(addData,function(data){
		//console.log(data);
		//res.redirect("/home");
		res.send({code:1});
	});
});

function authentication(req, res) {		
    if (!req.session.user) {	// 如果之前session里没有储存过user或者session过期，则不通过判断，返回登陆页	
        return res.redirect('/login');
    }
}

router.get("/downloadOne",function(req,res,next){
	var filepath = req.query.path,
		fReadStream;
	var rootFile = "uploads/";
	var a = filepath.split("/");
	fs.exists(rootFile+filepath,function(exist) {
        if(exist){
            res.set({
                "Content-type":"application/octet-stream",
                "Content-Disposition":"attachment;filename="+encodeURI(a[1])
            });
            fReadStream = fs.createReadStream(rootFile+filepath);
            fReadStream.on("data",(chunk) => res.write(chunk,"binary"));
            fReadStream.on("end",function () {
                res.end();
            });
        }else{
            res.set("Content-type","text/html");
            res.send("file not exist!");
            res.end();
        }
    });
});

//获取下载文件的地址
router.post('/download',function(req, res){
	var fileArray = req.body.fileArray;
    
    // 重组数组
    var newArray=fileArray.split("-");
    console.log(newArray[0]);
    if(fileArray.length == 0){
        res.send({"code":"fail", "summary":"no files"});
        return;
    }
    
    //只有一个文件的时候直接走get
    if(newArray.length==1){
    	var a = newArray[0].split("/");
    	var b = a[a.length-1];
    	var c = a[a.length-2];
    	var downloadUrl = "/downloadOne?path="+encodeURIComponent(c+"/"+b);
    	res.send({"code":"s_ok", "url":downloadUrl});
    }else{
    	var fileArrays=[];
    	for(var i=0;i<newArray.length;i++){
    		var x = newArray[i].split("/");
    		var y = x[x.length-2];
    		var z = x[x.length-1];
    		fileArrays.push(y+"/"+z);
    	}
    	console.log(fileArrays);
    	
    	//多个文件就压缩后再走get
        var output = fs.createWriteStream(path.join("zip",zipName));
        var archive = archiver.create('zip', {});
        archive.pipe(output);   //和输出流相接
        var currDir="uploads/";
        //打包文件
        archive.bulk([ 
            {
            	cwd:currDir,    //设置相对路径
                src: newArray,
                expand: currDir
            }
        ]);

        archive.on('error', function(err){
            res.send({"code":"failed", "summary":err});
            throw err;
        });
        archive.on('end', function(a){
            //输出下载链接
            //var downloadUrl = "/downloadSingle?dir="+encodeURIComponent(zipDir)+"&name="+encodeURIComponent(zipName)+"&comefrom=archive";
            //res.send({"code":"s_ok", "url":downloadUrl});
        });
        archive.finalize();
    }
	
});

//下载单个文件
router.get('/downloadSingle',function(req, res, next){
    var currDir = path.normalize(req.query.dir),
        comefrom = req.query.comefrom,
        fileName = req.query.name,
        currFile = path.join(currDir,fileName),
        fReadStream;

    fs.exists(currFile,function(exist) {
        if(exist){
            res.set({
                "Content-type":"application/octet-stream",
                "Content-Disposition":"attachment;filename="+encodeURI(fileName)
            });
            fReadStream = fs.createReadStream(currFile);
            fReadStream.on("data",(chunk) => res.write(chunk,"binary"));
            fReadStream.on("end",function () {
                res.end();
                //删除生成的压缩文件
                if(comefrom == "archive"){
                    setTimeout(() => fs.unlink(path.join(zipDir,zipName)), 100);
                }
            });
        }else{
            res.set("Content-type","text/html");
            res.send("file not exist!");
            res.end();
        }
    });
});

//获取下载文件的地址
router.post('/godownload',function(req, res){
    var currDir = path.normalize(req.body.dir),
    	fileArray = req.body.fileArray,
        filesCount = 0,     //非文件夹文件个数
        fileNameArray = [];
    
    //将文件和文件夹分开命名
    fileArray.forEach(function(file) {
        if(file.type == 1){
            filesCount++;
            fileNameArray.push(file.name);
        }else{
            fileNameArray.push(path.join(file.name,"**"));  //文件夹格式：folderName/**
        }
    });

    if(fileArray.length == 0){
        res.send({"code":"fail", "summary":"no files"});
        return;
    }

    if(filesCount == 1 && fileNameArray.length == 1){
        //只有一个文件的时候直接走get
        var downloadUrl = "/downloadSingle?dir="+encodeURIComponent(currDir)+"&name="+encodeURIComponent(fileNameArray[0]);
        res.send({"code":"s_ok", "url":downloadUrl});
    }else{
        //多个文件就压缩后再走get
        var output = fs.createWriteStream(path.join("zip",zipName));
        var archive = archiver.create('zip', {});
        archive.pipe(output);   //和输出流相接
        //打包文件
        archive.bulk([ 
            {
                cwd:currDir,    //设置相对路径
                src: fileNameArray,
                expand: currDir
            }
        ]);

        archive.on('error', function(err){
            res.send({"code":"failed", "summary":err});
            throw err;
        });
        archive.on('end', function(a){
            //输出下载链接
            var downloadUrl = "/downloadSingle?dir="+encodeURIComponent(zipDir)+"&name="+encodeURIComponent(zipName)+"&comefrom=archive";
            res.send({"code":"s_ok", "url":downloadUrl});
        });
        archive.finalize();
    }
});

//上传文件
var upload = multer({ dest: './uploads/'});
var cpUpload = upload.fields([
    {name: 'file'},
    {name: 'src'}
]);
router.post("/uploadFile",cpUpload, function(req, res, next){
    var files = req.files.file,
        dir = req.body.dir;

    var fsPromise = function(file){
        return new Promise(function(resolved,rejected){
            fs.rename(path.join(uploadDir,file.filename),path.join(dir,file.originalname),function(err){
                if(err){
                    rejected(err);
                }else{
                    resolved();
                }
            });
        });
    }
    Promise.all(files.map(fsPromise))
    .then(function(){
        res.set({
            'Content-Type':'text/html'
        });
        res.send({"code":"s_ok"});
        // res.end();
    })
    .catch(function(err) {
        res.send({"code":"failed", "summary":err});
    });
});



module.exports = router;
