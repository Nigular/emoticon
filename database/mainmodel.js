var mongoose = require("mongoose");
var db = mongoose.createConnection("localhost","mongoose-emoticon");	//连接数据表
db.on("error",console.error.bind(console,"连接错误"));
db.once("open",function(){
	console.log("打开成功");
})

/*
Schema  ：  一种以文件形式存储的数据库模型骨架，不具备数据库的操作能力
Model   ：  由Schema发布生成的模型，具有抽象属性和行为的数据库操作对
Entity  ：  由Model创建的实体，他的操作也会影响数据库
*/

//定义一个骨架Schema
var emtSchema = new mongoose.Schema({
    emtName   : {type : String},	//名字
    emtRoot  : {type : String},	//根目录
    emtCount  : {type : String},	//表情包数量
    insertTime : {type : String, default: Date.now}	//插入时间
});


//将该Schema发布为Model,创建collection连接user表
var MainModel = db.model('main',emtSchema);

// 插入一条数据
exports.addone = function(option,callback) {
   MainModel.create(option, function (err, docs) {
		if (err){
			return console.error(err);
        }else{
        	//console.log(docs);
            callback(docs);
        }
    });
}

exports.mainmodel = MainModel;// 作为一个模块被引用，要用exports把变量暴露出去