const fs = require("fs");
const vm = require("vm");

describe("stats history bounds", function () {
  for (const [range,hours] of [["hour",1],["day",24],["week",168]]) {
    it("reads only the necessary recent JSON files for " + range, async function () {
      let handler;
      const read = [];
      const files = Array.from({length:200}, (_,i)=>String(i).padStart(3,"0")+".json");
      const module = {exports:{}};
      const stubs = {
        express:{Router:function(){return {use(){},get(route,fn){if(route==="/stats.json") handler=fn;}};}},
        config:{admin:{uid:"test"}}, "./statsDirectory":"/stats",
        "fs-extra":{
          readdir:async()=>[...files,"zzz.json.backup","README"].reverse(),
          readJson:async filename=>{
            read.push(filename);
            const hour = Number(filename.split("/").pop().slice(0,3));
            return Array.from({length:60},(_,minute)=>({date:hour*60+minute}));
          },
        },
      };
      vm.runInNewContext(fs.readFileSync(require.resolve("../index"),"utf8"), {
        module,exports:module.exports,console:{log(){}},require:name=>stubs[name],
      });
      const res = {json:body=>{res.body=body;},status:code=>{throw new Error("Unexpected status "+code);}};
      await handler({query:{range,server:"node"}},res);
      expect(read.length).toBe(hours+1);
      expect(read).toEqual(files.slice(-(hours+1)).map(name=>"/stats/node/"+name));
      expect(res.body.length).toBe(hours*60);
      expect(res.body[0].date).toBe(11998);
      expect(res.body[res.body.length-1].date).toBe(11999-hours*60);
    });
  }
});
