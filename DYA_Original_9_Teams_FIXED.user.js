// ==UserScript==
// @name         DYA Original 9 Animal Teams - Native UI FIX
// @namespace    https://dya.jp/d11/
// @version      3.0.2
// @description  DYA標準の球団カードとクリック判定を使って動物モチーフの9球団を追加します。Elephants固定になるID衝突を修正。
// @match        https://dya.jp/d11/*
// @match        https://www.dya.jp/d11/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  const TEAMS = [{"name":"ウルブズ","en":"WOLVES","mark":"W","emoji":"🐺","tag":"走攻守のバランス型","style":"堅実な総合力と走塁","base_hit":[7,7,7,7],"base_pitch":[7,7,7,6,6,6,6,6,6],"base_def":6,"color":"3c465b","uniform":0,"positions":"768395421","players":[{"name":"黒瀬","bat":"6768","def":"9779486566","pitch":"544123211","height":79,"speed":8,"accel":27,"arm":8,"fielding":61,"color":"3c465b","role":"野手"},{"name":"三浦","bat":"8777","def":"4788865466","pitch":"335412241","height":74,"speed":7,"accel":23,"arm":3,"fielding":55,"color":"3c465b","role":"野手"},{"name":"相馬","bat":"9989","def":"7665885666","pitch":"323311321","height":72,"speed":13,"accel":22,"arm":4,"fielding":52,"color":"3c465b","role":"野手"},{"name":"久我","bat":"7887","def":"4869789678","pitch":"531134114","height":79,"speed":14,"accel":27,"arm":8,"fielding":51,"color":"3c465b","role":"野手"},{"name":"早瀬","bat":"7878","def":"8487977775","pitch":"344234121","height":69,"speed":17,"accel":19,"arm":9,"fielding":60,"color":"3c465b","role":"野手"},{"name":"桐山","bat":"9677","def":"6744477585","pitch":"144331232","height":87,"speed":6,"accel":19,"arm":4,"fielding":59,"color":"3c465b","role":"野手"},{"name":"宮原","bat":"7698","def":"5757658975","pitch":"112112111","height":68,"speed":16,"accel":23,"arm":1,"fielding":51,"color":"3c465b","role":"野手"},{"name":"瀬戸","bat":"7889","def":"6647674886","pitch":"533222323","height":74,"speed":9,"accel":25,"arm":4,"fielding":54,"color":"3c465b","role":"野手"},{"name":"飯島","bat":"1677","def":"7766488597","pitch":"979666686","height":82,"speed":15,"accel":26,"arm":2,"fielding":51,"color":"3c465b","role":"先発"},{"name":"神谷","bat":"6448","def":"8748478666","pitch":"153441323","height":76,"speed":4,"accel":19,"arm":5,"fielding":59,"color":"3c465b","role":"控え"},{"name":"杉浦","bat":"8677","def":"4887586468","pitch":"654555546","height":81,"speed":17,"accel":20,"arm":9,"fielding":55,"color":"3c465b","role":"救援候補"},{"name":"西森","bat":"6667","def":"4787878756","pitch":"534312113","height":74,"speed":11,"accel":27,"arm":6,"fielding":54,"color":"3c465b","role":"控え"},{"name":"高瀬","bat":"6487","def":"4468979655","pitch":"331242142","height":73,"speed":11,"accel":23,"arm":4,"fielding":53,"color":"3c465b","role":"控え"},{"name":"大森","bat":"8664","def":"6548984876","pitch":"646356577","height":73,"speed":13,"accel":28,"arm":4,"fielding":51,"color":"3c465b","role":"救援候補"},{"name":"風間","bat":"7964","def":"5678678696","pitch":"145222214","height":68,"speed":14,"accel":28,"arm":4,"fielding":51,"color":"3c465b","role":"控え"},{"name":"成瀬","bat":"5887","def":"6578557745","pitch":"222221311","height":73,"speed":15,"accel":19,"arm":2,"fielding":51,"color":"3c465b","role":"控え"},{"name":"小野寺","bat":"5766","def":"9487777985","pitch":"668754753","height":77,"speed":9,"accel":29,"arm":3,"fielding":55,"color":"3c465b","role":"救援候補"},{"name":"石黒","bat":"4547","def":"7688447687","pitch":"232214111","height":73,"speed":16,"accel":26,"arm":7,"fielding":54,"color":"3c465b","role":"控え"},{"name":"片桐","bat":"7568","def":"9967667648","pitch":"311423122","height":72,"speed":15,"accel":25,"arm":10,"fielding":55,"color":"3c465b","role":"控え"},{"name":"浅野","bat":"4566","def":"5974957886","pitch":"675653543","height":82,"speed":6,"accel":28,"arm":1,"fielding":55,"color":"3c465b","role":"救援候補"},{"name":"日野","bat":"5567","def":"7675896464","pitch":"876656667","height":74,"speed":11,"accel":23,"arm":4,"fielding":55,"color":"3c465b","role":"救援候補"}],"rating":"3344"},{"name":"パンサーズ","en":"PANTHERS","mark":"P","emoji":"🐆","tag":"俊足と広い守備範囲","style":"機動力・守備型","base_hit":[6,7,8,9],"base_pitch":[7,7,6,6,7,6,6,5,6],"base_def":7,"color":"34383f","uniform":1,"positions":"549387621","players":[{"name":"斎藤","bat":"5999","def":"8877668977","pitch":"331234322","height":74,"speed":7,"accel":22,"arm":4,"fielding":52,"color":"34383f","role":"野手"},{"name":"真田","bat":"7997","def":"6878896958","pitch":"431314441","height":70,"speed":7,"accel":21,"arm":1,"fielding":61,"color":"34383f","role":"野手"},{"name":"長岡","bat":"9789","def":"6899886857","pitch":"253242323","height":73,"speed":16,"accel":19,"arm":9,"fielding":53,"color":"34383f","role":"野手"},{"name":"朝倉","bat":"5879","def":"7659988675","pitch":"343321423","height":86,"speed":5,"accel":28,"arm":10,"fielding":58,"color":"34383f","role":"野手"},{"name":"鳴海","bat":"6999","def":"5877966787","pitch":"414131324","height":76,"speed":9,"accel":29,"arm":1,"fielding":59,"color":"34383f","role":"野手"},{"name":"藤森","bat":"4799","def":"5995596787","pitch":"343112244","height":74,"speed":10,"accel":21,"arm":6,"fielding":59,"color":"34383f","role":"野手"},{"name":"榊原","bat":"8899","def":"8758767758","pitch":"124322222","height":71,"speed":13,"accel":22,"arm":4,"fielding":52,"color":"34383f","role":"野手"},{"name":"佐伯","bat":"7898","def":"8599955977","pitch":"421124242","height":86,"speed":19,"accel":26,"arm":3,"fielding":57,"color":"34383f","role":"野手"},{"name":"島村","bat":"7989","def":"7877867798","pitch":"676466666","height":75,"speed":10,"accel":26,"arm":5,"fielding":52,"color":"34383f","role":"先発"},{"name":"秋山","bat":"5877","def":"7888898555","pitch":"433422322","height":80,"speed":4,"accel":30,"arm":6,"fielding":53,"color":"34383f","role":"控え"},{"name":"近藤","bat":"7499","def":"5986886567","pitch":"484545435","height":79,"speed":15,"accel":20,"arm":10,"fielding":61,"color":"34383f","role":"救援候補"},{"name":"梶原","bat":"5867","def":"5778899778","pitch":"112312122","height":76,"speed":15,"accel":29,"arm":1,"fielding":60,"color":"34383f","role":"控え"},{"name":"田淵","bat":"6479","def":"6879678959","pitch":"452212331","height":71,"speed":4,"accel":29,"arm":5,"fielding":59,"color":"34383f","role":"控え"},{"name":"平岡","bat":"5788","def":"6977895688","pitch":"465473546","height":87,"speed":13,"accel":22,"arm":2,"fielding":51,"color":"34383f","role":"救援候補"},{"name":"竹内","bat":"7899","def":"7567899867","pitch":"443221314","height":87,"speed":16,"accel":23,"arm":9,"fielding":56,"color":"34383f","role":"控え"},{"name":"黒田","bat":"6889","def":"9758778978","pitch":"544111331","height":88,"speed":10,"accel":22,"arm":8,"fielding":51,"color":"34383f","role":"控え"},{"name":"宮本","bat":"6669","def":"8955997977","pitch":"486485325","height":71,"speed":11,"accel":24,"arm":1,"fielding":57,"color":"34383f","role":"救援候補"},{"name":"梅原","bat":"5676","def":"8887778798","pitch":"324424422","height":84,"speed":13,"accel":20,"arm":1,"fielding":53,"color":"34383f","role":"控え"},{"name":"村松","bat":"4578","def":"7758999956","pitch":"223113313","height":79,"speed":15,"accel":26,"arm":5,"fielding":56,"color":"34383f","role":"控え"},{"name":"中谷","bat":"7777","def":"7767877996","pitch":"575365355","height":88,"speed":7,"accel":30,"arm":8,"fielding":51,"color":"34383f","role":"救援候補"},{"name":"国枝","bat":"5578","def":"6998795769","pitch":"653355345","height":80,"speed":12,"accel":29,"arm":2,"fielding":61,"color":"34383f","role":"救援候補"}],"rating":"3445"},{"name":"ベアーズ","en":"BEARS","mark":"B","emoji":"🐻","tag":"長打と強肩で押す","style":"長打・パワー型","base_hit":[9,6,6,5],"base_pitch":[8,6,8,7,6,5,6,7,6],"base_def":6,"color":"70401f","uniform":2,"positions":"879365421","players":[{"name":"熊谷","bat":"9767","def":"6868686887","pitch":"313132112","height":69,"speed":7,"accel":30,"arm":3,"fielding":57,"color":"70401f","role":"野手"},{"name":"森","bat":"9675","def":"7877767578","pitch":"111221422","height":75,"speed":14,"accel":25,"arm":1,"fielding":61,"color":"70401f","role":"野手"},{"name":"岩田","bat":"8874","def":"6588856748","pitch":"322132121","height":85,"speed":15,"accel":26,"arm":5,"fielding":59,"color":"70401f","role":"野手"},{"name":"岩本","bat":"9784","def":"5846689557","pitch":"434121112","height":78,"speed":7,"accel":20,"arm":3,"fielding":61,"color":"70401f","role":"野手"},{"name":"岡本","bat":"9877","def":"5657778668","pitch":"243113222","height":78,"speed":5,"accel":25,"arm":10,"fielding":51,"color":"70401f","role":"野手"},{"name":"牧野","bat":"9676","def":"4757696766","pitch":"552111212","height":86,"speed":10,"accel":26,"arm":5,"fielding":57,"color":"70401f","role":"野手"},{"name":"北原","bat":"9653","def":"7464788965","pitch":"531212343","height":73,"speed":12,"accel":25,"arm":7,"fielding":52,"color":"70401f","role":"野手"},{"name":"江藤","bat":"9585","def":"9788566976","pitch":"313211423","height":80,"speed":13,"accel":30,"arm":8,"fielding":59,"color":"70401f","role":"野手"},{"name":"大岩","bat":"9744","def":"6968446689","pitch":"887956675","height":82,"speed":15,"accel":21,"arm":6,"fielding":60,"color":"70401f","role":"先発"},{"name":"小松","bat":"6466","def":"7849766565","pitch":"334212213","height":82,"speed":13,"accel":24,"arm":10,"fielding":60,"color":"70401f","role":"控え"},{"name":"橋本","bat":"9344","def":"4854848755","pitch":"556444645","height":74,"speed":8,"accel":30,"arm":8,"fielding":61,"color":"70401f","role":"救援候補"},{"name":"安田","bat":"9532","def":"5698777787","pitch":"213224341","height":73,"speed":8,"accel":29,"arm":7,"fielding":55,"color":"70401f","role":"控え"},{"name":"柴崎","bat":"9465","def":"6757888668","pitch":"352134422","height":77,"speed":4,"accel":30,"arm":8,"fielding":53,"color":"70401f","role":"控え"},{"name":"室井","bat":"6465","def":"5676856744","pitch":"547456665","height":88,"speed":14,"accel":26,"arm":1,"fielding":56,"color":"70401f","role":"救援候補"},{"name":"関口","bat":"9773","def":"6448688478","pitch":"232331224","height":77,"speed":11,"accel":24,"arm":11,"fielding":53,"color":"70401f","role":"控え"},{"name":"河野","bat":"8636","def":"6756767889","pitch":"333233231","height":87,"speed":15,"accel":27,"arm":3,"fielding":54,"color":"70401f","role":"控え"},{"name":"大西","bat":"6462","def":"8766886874","pitch":"635655545","height":79,"speed":18,"accel":21,"arm":9,"fielding":53,"color":"70401f","role":"救援候補"},{"name":"松浦","bat":"8462","def":"8746784587","pitch":"313121341","height":80,"speed":13,"accel":26,"arm":8,"fielding":58,"color":"70401f","role":"控え"},{"name":"吉野","bat":"7764","def":"8666845688","pitch":"433211423","height":86,"speed":8,"accel":29,"arm":10,"fielding":56,"color":"70401f","role":"控え"},{"name":"荒川","bat":"8474","def":"6974686748","pitch":"858852345","height":77,"speed":10,"accel":25,"arm":9,"fielding":59,"color":"70401f","role":"救援候補"},{"name":"竹田","bat":"9365","def":"6485758455","pitch":"557756446","height":79,"speed":15,"accel":26,"arm":2,"fielding":51,"color":"70401f","role":"救援候補"}],"rating":"5332"},{"name":"フォックス","en":"FOXES","mark":"F","emoji":"🦊","tag":"巧打と緻密な投球","style":"巧打・制球型","base_hit":[6,9,9,7],"base_pitch":[6,9,7,6,8,5,7,6,6],"base_def":6,"color":"a76427","uniform":3,"positions":"638975421","players":[{"name":"狐塚","bat":"5997","def":"7867676747","pitch":"414213322","height":77,"speed":8,"accel":21,"arm":2,"fielding":56,"color":"a76427","role":"野手"},{"name":"狐崎","bat":"6878","def":"4986868856","pitch":"332222323","height":82,"speed":7,"accel":23,"arm":9,"fielding":52,"color":"a76427","role":"野手"},{"name":"尾崎","bat":"7996","def":"6495756564","pitch":"334312142","height":84,"speed":7,"accel":25,"arm":8,"fielding":57,"color":"a76427","role":"野手"},{"name":"井川","bat":"8878","def":"8879565464","pitch":"432411114","height":87,"speed":14,"accel":25,"arm":6,"fielding":53,"color":"a76427","role":"野手"},{"name":"滝本","bat":"7979","def":"5475887766","pitch":"521232211","height":87,"speed":7,"accel":25,"arm":9,"fielding":59,"color":"a76427","role":"野手"},{"name":"西川","bat":"5985","def":"6576698475","pitch":"114231222","height":68,"speed":13,"accel":26,"arm":7,"fielding":58,"color":"a76427","role":"野手"},{"name":"岸本","bat":"5878","def":"6686667769","pitch":"115433214","height":81,"speed":15,"accel":28,"arm":10,"fielding":57,"color":"a76427","role":"野手"},{"name":"河原","bat":"4996","def":"5864646974","pitch":"531242221","height":72,"speed":8,"accel":26,"arm":6,"fielding":59,"color":"a76427","role":"野手"},{"name":"高木","bat":"7197","def":"4754464787","pitch":"875595787","height":68,"speed":9,"accel":23,"arm":5,"fielding":53,"color":"a76427","role":"先発"},{"name":"吉岡","bat":"7995","def":"9869875776","pitch":"153113144","height":78,"speed":18,"accel":22,"arm":2,"fielding":52,"color":"a76427","role":"控え"},{"name":"宇野","bat":"5998","def":"6966756686","pitch":"596774657","height":83,"speed":7,"accel":25,"arm":8,"fielding":55,"color":"a76427","role":"救援候補"},{"name":"大橋","bat":"6787","def":"5477496844","pitch":"524223234","height":84,"speed":17,"accel":20,"arm":5,"fielding":51,"color":"a76427","role":"控え"},{"name":"上村","bat":"5988","def":"8888968766","pitch":"513412322","height":84,"speed":7,"accel":20,"arm":4,"fielding":58,"color":"a76427","role":"控え"},{"name":"野口","bat":"4895","def":"6686767765","pitch":"775764655","height":72,"speed":7,"accel":25,"arm":11,"fielding":55,"color":"a76427","role":"救援候補"},{"name":"福原","bat":"7986","def":"4456866496","pitch":"313412222","height":81,"speed":13,"accel":27,"arm":9,"fielding":53,"color":"a76427","role":"控え"},{"name":"矢野","bat":"5687","def":"6666657787","pitch":"434221221","height":68,"speed":17,"accel":27,"arm":3,"fielding":53,"color":"a76427","role":"控え"},{"name":"今村","bat":"6975","def":"8568878877","pitch":"788584774","height":85,"speed":14,"accel":21,"arm":3,"fielding":61,"color":"a76427","role":"救援候補"},{"name":"門田","bat":"6696","def":"7587868879","pitch":"315334442","height":88,"speed":16,"accel":26,"arm":11,"fielding":57,"color":"a76427","role":"控え"},{"name":"若林","bat":"6898","def":"7869767868","pitch":"112211123","height":88,"speed":13,"accel":19,"arm":3,"fielding":58,"color":"a76427","role":"控え"},{"name":"水野","bat":"3775","def":"4676865675","pitch":"395574654","height":83,"speed":5,"accel":21,"arm":3,"fielding":53,"color":"a76427","role":"救援候補"},{"name":"永井","bat":"6887","def":"8588676546","pitch":"488574454","height":82,"speed":17,"accel":24,"arm":11,"fielding":57,"color":"a76427","role":"救援候補"}],"rating":"3444"},{"name":"オルカス","en":"ORCAS","mark":"O","emoji":"🐋","tag":"制球と変化球で主導権","style":"投手・コンタクト型","base_hit":[7,8,8,6],"base_pitch":[8,8,7,6,7,8,5,6,7],"base_def":6,"color":"244e68","uniform":4,"positions":"984375621","players":[{"name":"海野","bat":"8787","def":"8759785748","pitch":"421132214","height":87,"speed":12,"accel":23,"arm":7,"fielding":54,"color":"244e68","role":"野手"},{"name":"潮田","bat":"9694","def":"8754846654","pitch":"233243123","height":70,"speed":10,"accel":30,"arm":8,"fielding":56,"color":"244e68","role":"野手"},{"name":"水島","bat":"7767","def":"8489678884","pitch":"535134132","height":73,"speed":18,"accel":24,"arm":2,"fielding":54,"color":"244e68","role":"野手"},{"name":"沖田","bat":"7998","def":"6669586676","pitch":"335242112","height":83,"speed":12,"accel":29,"arm":10,"fielding":61,"color":"244e68","role":"野手"},{"name":"浦野","bat":"9768","def":"7686655744","pitch":"354232411","height":70,"speed":11,"accel":28,"arm":6,"fielding":60,"color":"244e68","role":"野手"},{"name":"浜崎","bat":"5895","def":"6576877685","pitch":"133124241","height":78,"speed":13,"accel":21,"arm":3,"fielding":58,"color":"244e68","role":"野手"},{"name":"湊","bat":"9994","def":"7685758968","pitch":"353121114","height":81,"speed":19,"accel":24,"arm":11,"fielding":56,"color":"244e68","role":"野手"},{"name":"鮫島","bat":"8776","def":"8866484775","pitch":"524112111","height":72,"speed":10,"accel":30,"arm":8,"fielding":51,"color":"244e68","role":"野手"},{"name":"波多野","bat":"6899","def":"6767585877","pitch":"795579747","height":70,"speed":9,"accel":22,"arm":8,"fielding":61,"color":"244e68","role":"先発"},{"name":"早川","bat":"7555","def":"6566784457","pitch":"114141211","height":87,"speed":16,"accel":27,"arm":1,"fielding":55,"color":"244e68","role":"控え"},{"name":"相沢","bat":"5576","def":"6968584566","pitch":"795666355","height":71,"speed":4,"accel":23,"arm":8,"fielding":58,"color":"244e68","role":"救援候補"},{"name":"白波","bat":"5575","def":"7486774887","pitch":"154214233","height":76,"speed":8,"accel":26,"arm":3,"fielding":52,"color":"244e68","role":"控え"},{"name":"石浜","bat":"4794","def":"8459567665","pitch":"315112213","height":85,"speed":18,"accel":23,"arm":11,"fielding":56,"color":"244e68","role":"控え"},{"name":"青木","bat":"7677","def":"7748978764","pitch":"977646446","height":71,"speed":13,"accel":22,"arm":8,"fielding":51,"color":"244e68","role":"救援候補"},{"name":"岩瀬","bat":"5955","def":"5456695684","pitch":"354422123","height":82,"speed":8,"accel":24,"arm":9,"fielding":61,"color":"244e68","role":"控え"},{"name":"梶谷","bat":"4776","def":"8456887757","pitch":"455232221","height":85,"speed":10,"accel":25,"arm":10,"fielding":57,"color":"244e68","role":"控え"},{"name":"長谷部","bat":"7974","def":"7666565654","pitch":"586576564","height":87,"speed":5,"accel":21,"arm":11,"fielding":58,"color":"244e68","role":"救援候補"},{"name":"竹原","bat":"7965","def":"6657755597","pitch":"411234221","height":77,"speed":6,"accel":19,"arm":9,"fielding":52,"color":"244e68","role":"控え"},{"name":"日高","bat":"6984","def":"8765456564","pitch":"433323322","height":86,"speed":15,"accel":19,"arm":9,"fielding":60,"color":"244e68","role":"控え"},{"name":"船越","bat":"7774","def":"7866766646","pitch":"555357337","height":81,"speed":14,"accel":19,"arm":9,"fielding":60,"color":"244e68","role":"救援候補"},{"name":"小森","bat":"8693","def":"7469884777","pitch":"765369254","height":73,"speed":17,"accel":30,"arm":3,"fielding":61,"color":"244e68","role":"救援候補"}],"rating":"4443"},{"name":"バイソンズ","en":"BISONS","mark":"BI","emoji":"🦬","tag":"強打と内野の堅さ","style":"パワー・堅守型","base_hit":[8,7,6,6],"base_pitch":[8,7,8,7,6,5,7,7,6],"base_def":7,"color":"675137","uniform":5,"positions":"573986421","players":[{"name":"牛島","bat":"9878","def":"8959776985","pitch":"344424234","height":68,"speed":7,"accel":27,"arm":10,"fielding":61,"color":"675137","role":"野手"},{"name":"牛尾","bat":"8978","def":"7997757677","pitch":"332111133","height":74,"speed":19,"accel":30,"arm":4,"fielding":57,"color":"675137","role":"野手"},{"name":"黒岩","bat":"9874","def":"8597979767","pitch":"544231211","height":72,"speed":6,"accel":21,"arm":6,"fielding":55,"color":"675137","role":"野手"},{"name":"赤松","bat":"1878","def":"8969956689","pitch":"315342343","height":73,"speed":7,"accel":20,"arm":7,"fielding":59,"color":"675137","role":"野手"},{"name":"佐野","bat":"7945","def":"9677997667","pitch":"213321221","height":71,"speed":5,"accel":22,"arm":4,"fielding":55,"color":"675137","role":"野手"},{"name":"大谷","bat":"9867","def":"7896998786","pitch":"124211424","height":76,"speed":17,"accel":27,"arm":9,"fielding":58,"color":"675137","role":"野手"},{"name":"石橋","bat":"9944","def":"7879579977","pitch":"334232323","height":86,"speed":12,"accel":29,"arm":8,"fielding":56,"color":"675137","role":"野手"},{"name":"桐谷","bat":"6547","def":"9799899969","pitch":"141321133","height":84,"speed":17,"accel":25,"arm":5,"fielding":54,"color":"675137","role":"野手"},{"name":"久保田","bat":"9764","def":"6858987798","pitch":"978977676","height":71,"speed":5,"accel":26,"arm":1,"fielding":55,"color":"675137","role":"先発"},{"name":"白川","bat":"8676","def":"9967856896","pitch":"312241143","height":86,"speed":6,"accel":29,"arm":11,"fielding":59,"color":"675137","role":"控え"},{"name":"長田","bat":"6744","def":"7879977998","pitch":"656444564","height":68,"speed":8,"accel":20,"arm":3,"fielding":60,"color":"675137","role":"救援候補"},{"name":"藤田","bat":"8566","def":"6899567979","pitch":"131124243","height":87,"speed":6,"accel":23,"arm":1,"fielding":55,"color":"675137","role":"控え"},{"name":"末吉","bat":"7676","def":"9799768956","pitch":"253112234","height":84,"speed":11,"accel":20,"arm":10,"fielding":53,"color":"675137","role":"控え"},{"name":"瀬川","bat":"9757","def":"7788987888","pitch":"775466663","height":86,"speed":5,"accel":21,"arm":9,"fielding":58,"color":"675137","role":"救援候補"},{"name":"金子","bat":"8976","def":"6887999767","pitch":"342334211","height":84,"speed":5,"accel":19,"arm":1,"fielding":58,"color":"675137","role":"控え"},{"name":"青山","bat":"5677","def":"9575579986","pitch":"423233122","height":84,"speed":10,"accel":25,"arm":7,"fielding":57,"color":"675137","role":"控え"},{"name":"望月","bat":"8774","def":"9987977988","pitch":"966653845","height":82,"speed":18,"accel":19,"arm":7,"fielding":57,"color":"675137","role":"救援候補"},{"name":"杉本","bat":"8775","def":"8698779798","pitch":"333341222","height":75,"speed":4,"accel":26,"arm":5,"fielding":60,"color":"675137","role":"控え"},{"name":"三宅","bat":"8766","def":"9779877787","pitch":"542112213","height":70,"speed":15,"accel":26,"arm":11,"fielding":53,"color":"675137","role":"控え"},{"name":"小暮","bat":"7664","def":"8985869677","pitch":"585844744","height":88,"speed":10,"accel":28,"arm":3,"fielding":59,"color":"675137","role":"救援候補"},{"name":"岡崎","bat":"5756","def":"7998875675","pitch":"858554547","height":80,"speed":5,"accel":25,"arm":10,"fielding":61,"color":"675137","role":"救援候補"}],"rating":"4433"},{"name":"コブラズ","en":"COBRAS","mark":"C","emoji":"🐍","tag":"多彩な変化球と小技","style":"変化球・技巧型","base_hit":[6,8,8,7],"base_pitch":[7,7,7,9,8,7,6,8,7],"base_def":6,"color":"62733c","uniform":6,"positions":"846395721","players":[{"name":"蛇塚","bat":"7888","def":"6577486465","pitch":"434413213","height":86,"speed":19,"accel":28,"arm":9,"fielding":51,"color":"62733c","role":"野手"},{"name":"蛇谷","bat":"6998","def":"8756686845","pitch":"233314412","height":88,"speed":14,"accel":28,"arm":2,"fielding":54,"color":"62733c","role":"野手"},{"name":"早乙女","bat":"7999","def":"7879674578","pitch":"145423123","height":69,"speed":9,"accel":25,"arm":2,"fielding":52,"color":"62733c","role":"野手"},{"name":"唐沢","bat":"4997","def":"8786747665","pitch":"453233411","height":71,"speed":11,"accel":26,"arm":10,"fielding":57,"color":"62733c","role":"野手"},{"name":"辰巳","bat":"9988","def":"4666868685","pitch":"215214141","height":79,"speed":8,"accel":28,"arm":3,"fielding":60,"color":"62733c","role":"野手"},{"name":"龍崎","bat":"6796","def":"5764698684","pitch":"353112212","height":79,"speed":19,"accel":28,"arm":1,"fielding":57,"color":"62733c","role":"野手"},{"name":"御子柴","bat":"8989","def":"4786449766","pitch":"433123122","height":76,"speed":13,"accel":28,"arm":9,"fielding":52,"color":"62733c","role":"野手"},{"name":"堀内","bat":"7795","def":"7686478958","pitch":"214111242","height":78,"speed":12,"accel":29,"arm":1,"fielding":52,"color":"62733c","role":"野手"},{"name":"岸","bat":"8997","def":"8755844595","pitch":"977989785","height":85,"speed":19,"accel":30,"arm":6,"fielding":51,"color":"62733c","role":"先発"},{"name":"横山","bat":"4678","def":"8986676684","pitch":"434241123","height":81,"speed":9,"accel":24,"arm":3,"fielding":58,"color":"62733c","role":"控え"},{"name":"宮下","bat":"3576","def":"6887967588","pitch":"857864476","height":68,"speed":18,"accel":23,"arm":8,"fielding":59,"color":"62733c","role":"救援候補"},{"name":"徳永","bat":"5777","def":"7596655568","pitch":"331121132","height":72,"speed":18,"accel":23,"arm":3,"fielding":56,"color":"62733c","role":"控え"},{"name":"桜井","bat":"5688","def":"6888747788","pitch":"311334424","height":80,"speed":15,"accel":28,"arm":5,"fielding":53,"color":"62733c","role":"控え"},{"name":"川上","bat":"5977","def":"6678994877","pitch":"875967485","height":77,"speed":18,"accel":25,"arm":2,"fielding":52,"color":"62733c","role":"救援候補"},{"name":"守屋","bat":"6764","def":"4866786795","pitch":"535223323","height":82,"speed":18,"accel":27,"arm":1,"fielding":61,"color":"62733c","role":"控え"},{"name":"相原","bat":"5784","def":"6455579785","pitch":"222441114","height":84,"speed":6,"accel":24,"arm":8,"fielding":61,"color":"62733c","role":"控え"},{"name":"石田","bat":"4876","def":"7784754684","pitch":"577875396","height":80,"speed":16,"accel":29,"arm":4,"fielding":60,"color":"62733c","role":"救援候補"},{"name":"二階堂","bat":"6877","def":"6668565887","pitch":"231243423","height":82,"speed":14,"accel":20,"arm":7,"fielding":56,"color":"62733c","role":"控え"},{"name":"大崎","bat":"7858","def":"9679674665","pitch":"233322424","height":86,"speed":4,"accel":30,"arm":8,"fielding":55,"color":"62733c","role":"控え"},{"name":"山岸","bat":"3986","def":"6686776646","pitch":"744686454","height":77,"speed":7,"accel":22,"arm":5,"fielding":54,"color":"62733c","role":"救援候補"},{"name":"久米","bat":"6794","def":"6789896645","pitch":"478678577","height":73,"speed":17,"accel":27,"arm":9,"fielding":54,"color":"62733c","role":"救援候補"}],"rating":"3444"},{"name":"ホーネッツ","en":"HORNETS","mark":"H","emoji":"🐝","tag":"俊足と速い試合運び","style":"俊足・機動力型","base_hit":[6,8,8,9],"base_pitch":[7,8,6,7,6,7,6,5,6],"base_def":6,"color":"b58a22","uniform":7,"positions":"695384721","players":[{"name":"蜂須賀","bat":"7799","def":"6767674667","pitch":"313223143","height":81,"speed":5,"accel":30,"arm":2,"fielding":59,"color":"b58a22","role":"野手"},{"name":"蜂谷","bat":"7988","def":"6976774778","pitch":"235413213","height":77,"speed":10,"accel":29,"arm":4,"fielding":59,"color":"b58a22","role":"野手"},{"name":"羽賀","bat":"7779","def":"4796788656","pitch":"323311111","height":86,"speed":11,"accel":19,"arm":2,"fielding":51,"color":"b58a22","role":"野手"},{"name":"戸田","bat":"4999","def":"6758786656","pitch":"153132322","height":77,"speed":17,"accel":22,"arm":6,"fielding":54,"color":"b58a22","role":"野手"},{"name":"小泉","bat":"8999","def":"8487675855","pitch":"334122233","height":87,"speed":13,"accel":28,"arm":11,"fielding":59,"color":"b58a22","role":"野手"},{"name":"鈴村","bat":"7719","def":"8665479468","pitch":"331112411","height":77,"speed":12,"accel":26,"arm":5,"fielding":59,"color":"b58a22","role":"野手"},{"name":"長尾","bat":"6967","def":"7868787557","pitch":"133211334","height":86,"speed":14,"accel":26,"arm":7,"fielding":61,"color":"b58a22","role":"野手"},{"name":"白井","bat":"7991","def":"5474845878","pitch":"313232414","height":76,"speed":18,"accel":29,"arm":10,"fielding":51,"color":"b58a22","role":"野手"},{"name":"高野","bat":"6978","def":"5966447785","pitch":"985765557","height":75,"speed":9,"accel":20,"arm":6,"fielding":55,"color":"b58a22","role":"先発"},{"name":"田島","bat":"6868","def":"8948668466","pitch":"111313412","height":84,"speed":17,"accel":28,"arm":8,"fielding":52,"color":"b58a22","role":"控え"},{"name":"倉持","bat":"3889","def":"6786767858","pitch":"773446523","height":85,"speed":9,"accel":22,"arm":5,"fielding":52,"color":"b58a22","role":"救援候補"},{"name":"新井","bat":"3798","def":"7888466887","pitch":"412212233","height":78,"speed":7,"accel":29,"arm":10,"fielding":54,"color":"b58a22","role":"控え"},{"name":"須藤","bat":"5779","def":"6558789864","pitch":"124312122","height":71,"speed":12,"accel":30,"arm":4,"fielding":52,"color":"b58a22","role":"控え"},{"name":"吉村","bat":"6756","def":"4478787774","pitch":"495557436","height":79,"speed":6,"accel":28,"arm":7,"fielding":56,"color":"b58a22","role":"救援候補"},{"name":"大槻","bat":"4988","def":"6847788677","pitch":"343342121","height":69,"speed":7,"accel":26,"arm":6,"fielding":53,"color":"b58a22","role":"控え"},{"name":"木村","bat":"4589","def":"6687856889","pitch":"142132322","height":83,"speed":10,"accel":27,"arm":6,"fielding":58,"color":"b58a22","role":"控え"},{"name":"谷口","bat":"5759","def":"7768768768","pitch":"466756643","height":81,"speed":4,"accel":30,"arm":9,"fielding":57,"color":"b58a22","role":"救援候補"},{"name":"笠原","bat":"7976","def":"6867577587","pitch":"315111122","height":82,"speed":8,"accel":28,"arm":4,"fielding":58,"color":"b58a22","role":"控え"},{"name":"野村","bat":"5969","def":"7867644564","pitch":"445223111","height":86,"speed":18,"accel":20,"arm":7,"fielding":61,"color":"b58a22","role":"控え"},{"name":"富田","bat":"5967","def":"7997784885","pitch":"866767555","height":87,"speed":16,"accel":20,"arm":2,"fielding":52,"color":"b58a22","role":"救援候補"},{"name":"神田","bat":"9899","def":"8476697665","pitch":"654647546","height":84,"speed":5,"accel":29,"arm":11,"fielding":52,"color":"b58a22","role":"救援候補"}],"rating":"3444"},{"name":"コヨーテズ","en":"COYOTES","mark":"CY","emoji":"🐺","tag":"穴の少ない選手層","style":"総合力・対応型","base_hit":[7,7,7,8],"base_pitch":[7,7,7,7,7,7,6,7,6],"base_def":6,"color":"77665b","uniform":8,"positions":"237896541","players":[{"name":"遠山","bat":"8199","def":"9865848487","pitch":"315131341","height":82,"speed":7,"accel":21,"arm":4,"fielding":54,"color":"77665b","role":"野手"},{"name":"野沢","bat":"7787","def":"8976666585","pitch":"324131432","height":76,"speed":14,"accel":26,"arm":9,"fielding":55,"color":"77665b","role":"野手"},{"name":"桐生","bat":"6979","def":"6895788546","pitch":"233111112","height":69,"speed":5,"accel":30,"arm":11,"fielding":53,"color":"77665b","role":"野手"},{"name":"千田","bat":"5871","def":"6648769667","pitch":"552111311","height":77,"speed":11,"accel":20,"arm":2,"fielding":55,"color":"77665b","role":"野手"},{"name":"高井","bat":"9997","def":"8458966584","pitch":"343314321","height":72,"speed":8,"accel":25,"arm":3,"fielding":53,"color":"77665b","role":"野手"},{"name":"梶","bat":"7879","def":"8558787857","pitch":"335112412","height":70,"speed":7,"accel":30,"arm":6,"fielding":58,"color":"77665b","role":"野手"},{"name":"川崎","bat":"9889","def":"6846676766","pitch":"532242112","height":81,"speed":17,"accel":21,"arm":7,"fielding":51,"color":"77665b","role":"野手"},{"name":"沢村","bat":"5859","def":"7667545987","pitch":"243231112","height":75,"speed":17,"accel":23,"arm":7,"fielding":57,"color":"77665b","role":"野手"},{"name":"平田","bat":"9819","def":"6645687678","pitch":"779896475","height":76,"speed":17,"accel":19,"arm":2,"fielding":55,"color":"77665b","role":"先発"},{"name":"大竹","bat":"4477","def":"6958556455","pitch":"412241124","height":78,"speed":7,"accel":27,"arm":2,"fielding":58,"color":"77665b","role":"控え"},{"name":"栗原","bat":"7566","def":"6976575875","pitch":"664465554","height":85,"speed":5,"accel":22,"arm":6,"fielding":59,"color":"77665b","role":"救援候補"},{"name":"三好","bat":"7897","def":"7475675667","pitch":"111442233","height":81,"speed":4,"accel":22,"arm":8,"fielding":55,"color":"77665b","role":"控え"},{"name":"板倉","bat":"6489","def":"8678756886","pitch":"432224131","height":78,"speed":8,"accel":24,"arm":4,"fielding":55,"color":"77665b","role":"控え"},{"name":"榎本","bat":"7867","def":"6766864556","pitch":"658554656","height":83,"speed":9,"accel":27,"arm":1,"fielding":56,"color":"77665b","role":"救援候補"},{"name":"長谷川","bat":"7847","def":"6656577674","pitch":"511131114","height":82,"speed":17,"accel":23,"arm":4,"fielding":51,"color":"77665b","role":"控え"},{"name":"内田","bat":"7647","def":"6666667567","pitch":"121422412","height":82,"speed":8,"accel":27,"arm":10,"fielding":60,"color":"77665b","role":"控え"},{"name":"小田","bat":"7467","def":"7564686656","pitch":"747455547","height":76,"speed":16,"accel":30,"arm":6,"fielding":53,"color":"77665b","role":"救援候補"},{"name":"永田","bat":"7786","def":"8864666789","pitch":"343122331","height":76,"speed":6,"accel":27,"arm":8,"fielding":55,"color":"77665b","role":"控え"},{"name":"岩井","bat":"9875","def":"8858856456","pitch":"352312314","height":81,"speed":4,"accel":25,"arm":2,"fielding":61,"color":"77665b","role":"控え"},{"name":"鷲見","bat":"7457","def":"8857764766","pitch":"647464344","height":88,"speed":7,"accel":26,"arm":4,"fielding":59,"color":"77665b","role":"救援候補"},{"name":"矢島","bat":"6477","def":"6687658878","pitch":"654574763","height":86,"speed":17,"accel":20,"arm":6,"fielding":61,"color":"77665b","role":"救援候補"}],"rating":"4334"}];
  const PAGE_BUTTON = 1900;
  const SLOT_IDS = [9,10,11];
  const CARD_BUTTON_BASE = 1000;
  const symbols = '0123456789ABCDEFGHIJK';

  let original = null;
  let installed = false;
  let legacyConflict = false;
  let page = 0; // 0: official 12 clubs; 1-3: custom clubs
  const customBySlot = new Map(); // Native DYA IDs 0..11 only; custom entries are assigned to a free native slot.
  let insideNativeLp = false;
  let suppressSelectionFrame = false;
  let renderLeftTeam = null;
  let renderRightTeam = null;
  let renderOffset = 0;

  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const getCustom = id => customBySlot.get(Number(id));
  const visibleTeam = slot => {
    if (page < 1 || page > 3 || slot < 9 || slot > 11) return null;
    return TEAMS[(page-1)*3 + (slot-9)] || null;
  };
  function nativeOffset(game) {
    const scale = Number(game.ltl) || 1;
    let y = Number(game.wh)/scale/2 - 272;
    if (String(game.sv_conf || '') !== '') {
      y -= 16;
      if (Number(game.wh)/Number(game.ww) > 1.5) y -= 32;
    }
    return y;
  }
  function makeRawRecord(player) {
    const physical = `${player.pitch}*${player.height}*${player.speed}*${player.accel}*${player.arm}*${player.fielding}*${player.color}*0*0`;
    return `${player.name}#${player.bat}${player.def}#${physical}#`;
  }
  function recordsFor(team, withCondition=true) {
    return team.players.map(p => makeRawRecord(p) + '/0' + (withCondition ? '#2' : ''));
  }
  function lineupFor(team) {
    return team.players.map((p,i) => `#${symbols[i]}#${p.name}`).join('');
  }
  function averageRating(team) { return team.rating; }
  function teamForAssignedId(id) {
    const index = getCustom(id);
    return index === undefined ? null : TEAMS[index];
  }
  function syncPresentation(game) {
    if (!original) return;
    for (const id of SLOT_IDS) {
      game.team_pr[id] = original.teamPr[id];
      game.team_color[id] = original.teamColor[id];
    }
    for (const [id,index] of customBySlot.entries()) {
      if (id >= 0 && id <= 11) {
        const team = TEAMS[index];
        game.team_pr[id] = averageRating(team);
        game.team_color[id] = '#' + team.color;
      }
    }
  }
  function chooseFreeCustomSlot(exclude, preferred) {
    const candidates = [preferred,9,10,11];
    for (const id of candidates) {
      if (Number.isInteger(id) && id >= 9 && id <= 11 && id !== exclude) return id;
    }
    return [9,10,11].find(id => id !== exclude);
  }
  function setSideId(game,side,id) {
    if (side === 0) game.team_l = id;
    else game.team_r = id;
  }
  function sideId(game,side) { return Number(side === 0 ? game.team_l : game.team_r); }

  function applyCardSelection(game, side, clickedSlot, customIndex, oldOwnId) {
    const otherSide = 1-side;
    const otherId = sideId(game,otherSide);
    const otherCustom = getCustom(otherId);

    if (customIndex !== null) {
      // The visual card slot is 9/10/11. If the opponent already owns that ID,
      // keep their identity and assign this new custom team to another free native ID.
      let assigned = clickedSlot;
      if (assigned === otherId) assigned = chooseFreeCustomSlot(otherId, oldOwnId);
      if (assigned === undefined) throw new Error('追加球団の選択枠を確保できませんでした。');
      if (oldOwnId !== otherId && oldOwnId !== assigned) customBySlot.delete(oldOwnId);
      customBySlot.set(assigned, customIndex);
      setSideId(game,side,assigned);
    } else {
      // Official club selected. If it collides with the other side's custom team,
      // move that custom team to a free 9/10/11 slot before restoring the official ID.
      // Release this side's previous custom slot first; it may be the free slot
      // needed to move the opponent's custom team away from the official ID.
      if (oldOwnId !== otherId) customBySlot.delete(oldOwnId);
      if (clickedSlot === otherId && otherCustom !== undefined) {
        const moved = chooseFreeCustomSlot(clickedSlot, oldOwnId);
        if (moved === undefined) throw new Error('追加球団の移動先を確保できませんでした。');
        customBySlot.delete(otherId);
        customBySlot.set(moved, otherCustom);
        setSideId(game,otherSide,moved);
      }
      // An official team always owns its original ID; it must never inherit a custom roster.
      if (clickedSlot !== otherId) customBySlot.delete(clickedSlot);
      setSideId(game,side,clickedSlot);
    }
    // Retain only custom mappings referenced by one of the two active team IDs.
    const activeIds = new Set([Number(game.team_l),Number(game.team_r)]);
    for (const id of Array.from(customBySlot.keys())) if (!activeIds.has(id)) customBySlot.delete(id);
    syncPresentation(game);
  }

  function patchedTeamData(teamId, mode) {
    const team = teamForAssignedId(teamId);
    if (!team) return original.teamData.apply(this, arguments);
    // Keep raw records separate from the native "#2" suffix. In stock DYA,
    // team_data(i, i2>99) appends exactly one "#2" to the requested player.
    const rawRecords = recordsFor(team,false);
    const readyRecords = rawRecords.map(record => record + '#2');
    const nMode = Number(mode);
    if (nMode > 99) {
      return rawRecords[nMode-100] ? rawRecords[nMode-100] + '#2' : '';
    }
    if (nMode === 1) {
      // Native team_data(i,1) loads the CPU roster on the side opposite my_tb.
      const cpuSide = Number(window.my_tb) === 1 ? 0 : 1;
      window.team_data_set(cpuSide, readyRecords, team.positions);
      return;
    }
    // Native team_data(i,0) path: match_start() consumes plr_dat + shibi_ps.
    window.plr_dat = readyRecords;
    window.shibi_ps = team.positions;
    return;
  }
  function patchedLineup(teamId) {
    const team = teamForAssignedId(teamId);
    return team ? lineupFor(team) : original.teamLineUp.apply(this,arguments);
  }
  function patchedTeamDataSet(side, roster, positions) {
    const oldLeft = window.team_l;
    const oldRight = window.team_r;
    try {
      const leftTeam = teamForAssignedId(oldLeft);
      const rightTeam = teamForAssignedId(oldRight);
      // DYA's native uniform/avatar selection tables only accept original style IDs 0..8.
      if (leftTeam) window.team_l = leftTeam.uniform;
      if (rightTeam) window.team_r = rightTeam.uniform;
      return original.teamDataSet.apply(this,arguments);
    } finally {
      window.team_l = oldLeft;
      window.team_r = oldRight;
    }
  }

  function drawBadge(ctx,scale,x,y,team,size) {
    const radius = 19*size;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x*scale,y*scale,radius*scale,0,Math.PI*2);
    ctx.fillStyle = '#'+team.color;
    ctx.fill();
    ctx.lineWidth = 2*scale*size;
    ctx.strokeStyle = '#f3d783';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x*scale,y*scale,(radius-4*size)*scale,0,Math.PI*2);
    ctx.lineWidth = 1*scale*size;
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${(team.mark.length > 1 ? 14 : 18)*scale*size}px sans-serif`;
    ctx.fillText(team.mark,x*scale,y*scale+0.5*scale*size);
    ctx.restore();
  }
  function patchedSptCs1C(sprite,x,y,size) {
    if (insideNativeLp && Number(window.run_mode) === 2) {
      const xx = Number(x), yy = Number(y);
      if (Math.abs(yy-(516+renderOffset)) < 2 && [243,397,551].some(v=>Math.abs(xx-v)<2)) {
        const slot = [243,397,551].findIndex(v=>Math.abs(xx-v)<2) + 9;
        const team = visibleTeam(slot);
        if (team) { drawBadge(window.ctx,Number(window.ltl)||1,xx,yy,team,Number(size)||0.75); return; }
      }
      if (Math.abs(yy-(98+renderOffset)) < 2 && (Math.abs(xx-206)<2 || Math.abs(xx-434)<2)) {
        const team = Math.abs(xx-206)<2 ? renderLeftTeam : renderRightTeam;
        if (team) { drawBadge(window.ctx,Number(window.ltl)||1,xx,yy,team,Number(size)||1); return; }
      }
    }
    return original.sptCs1C.apply(this,arguments);
  }
  function patchedStsetC(text,x,y) {
    if (insideNativeLp && Number(window.run_mode) === 2 && page > 0 && Math.abs(Number(y)-(578+renderOffset))<2) {
      const index = [243,397,551].findIndex(v=>Math.abs(Number(x)-v)<2);
      if (index >= 0) {
        const team = TEAMS[(page-1)*3+index];
        if (team) text = team.name;
      }
    }
    return original.stsetC.call(this,text,x,y);
  }
  function patchedSptCs1(sprite,x,y,size) {
    if (insideNativeLp && suppressSelectionFrame && [188,189,190,191].includes(Number(sprite))) return;
    return original.sptCs1.apply(this,arguments);
  }

  function drawPageButton(game) {
    const scale = Number(game.ltl) || 1;
    const offset = nativeOffset(game);
    const x=249, y=174+offset, w=142, h=28;
    const labels=['追加球団を見る ▶','追加球団 2/3 ▶','追加球団 3/3 ▶','公式12球団へ戻る ↩'];
    const ctx=game.ctx;
    ctx.save();
    ctx.fillStyle = page===0 ? '#125b83' : '#174a65';
    ctx.fillRect(x*scale,y*scale,w*scale,h*scale);
    ctx.strokeStyle='#d7e8f2';
    ctx.lineWidth=1*scale;
    ctx.strokeRect((x+0.5)*scale,(y+0.5)*scale,(w-1)*scale,(h-1)*scale);
    ctx.fillStyle='#fff';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.font=`bold ${13*scale}px sans-serif`;
    ctx.fillText(labels[page],(x+w/2)*scale,(y+h/2)*scale,w*scale-8*scale);
    ctx.restore();
    game.button_area(PAGE_BUTTON,x,y,w,h);
  }

  function patchedLp() {
    if (Number(window.run_mode) !== 2) return original.lp.apply(this,arguments);
    const game=window;
    syncPresentation(game);
    const originalLeft=Number(game.team_l), originalRight=Number(game.team_r);
    renderLeftTeam=teamForAssignedId(originalLeft);
    renderRightTeam=teamForAssignedId(originalRight);
    renderOffset=nativeOffset(game);
    const activeSide=Number(game.select_team_lr)===1 ? 1 : 0;
    const activeId=activeSide===0 ? originalLeft : originalRight;
    const activeCustomIndex=getCustom(activeId);
    let temporarySlot=null;
    const savedRatings=[];
    suppressSelectionFrame=false;
    if (activeCustomIndex !== undefined) {
      if (page > 0 && Math.floor(activeCustomIndex/3) === page-1) {
        temporarySlot=9+(activeCustomIndex%3);
      } else {
        // Keep the real selected ID for the header; hide only the off-page card marker.
        suppressSelectionFrame=true;
      }
      if (temporarySlot !== null) {
        const arrIndex=temporarySlot;
        savedRatings.push([arrIndex,game.team_pr[arrIndex],game.team_color[arrIndex]]);
        const selectedTeam=TEAMS[activeCustomIndex];
        game.team_pr[arrIndex]=selectedTeam.rating;
        game.team_color[arrIndex]='#'+selectedTeam.color;
        if (activeSide===0) game.team_l=temporarySlot; else game.team_r=temporarySlot;
      }
    } else if (page > 0 && activeId >= 9 && activeId <= 11) {
      // The currently selected official team 9-11 is not visible on a custom page.
      suppressSelectionFrame=true;
    }
    insideNativeLp=true;
    try {
      const result=original.lp.apply(this,arguments);
      drawPageButton(game);
      return result;
    } finally {
      insideNativeLp=false;
      suppressSelectionFrame=false;
      game.team_l=originalLeft;
      game.team_r=originalRight;
      for (const [id,rating,color] of savedRatings) { game.team_pr[id]=rating; game.team_color[id]=color; }
    }
  }

  function patchedPdo2() {
    const isSelector=Number(window.run_mode)===2;
    const clicked=Number(window.onflg);
    if (isSelector && clicked===PAGE_BUTTON) {
      page=(page+1)%4;
      if (typeof window.sndf==='function') window.sndf(4,.1);
      if (typeof window.btn_reset==='function') window.btn_reset();
      return;
    }
    const side=isSelector ? (Number(window.select_team_lr)===1 ? 1 : 0) : -1;
    const oldOwnId=side===0 ? Number(window.team_l) : Number(window.team_r);
    const isCard=isSelector && clicked>=1000 && clicked<=1011;
    const visualSlot=isCard ? clicked-1000 : -1;
    let customIndex=null;
    if (isCard && page>0 && visualSlot>=9 && visualSlot<=11) {
      customIndex=(page-1)*3+(visualSlot-9);
    }
    const result=original.pdo2.apply(this,arguments);
    if (isCard) {
      applyCardSelection(window,side,visualSlot,customIndex,oldOwnId);
    }
    return result;
  }

  function install(game) {
    if (installed) return true;
    if (game.DYA_CUSTOM_TEAMS_3?.active || game.DYA_ORIGINAL_9_TEAMS?.active || game.DYA_ORIGINAL_9_TEAMS_FIX?.active) {
      if (!legacyConflict) {
        legacyConflict = true;
        console.error('[DYA Original 9 Teams FIX] Another older DYA team add-on is active. Disable the older add-on and reload.');
        if (typeof game.alert === 'function') game.alert('古いDYA追加チームスクリプトが同時に有効です。古い版を無効にして、ページを再読み込みしてください。');
      }
      return false;
    }
    const required=['team_data','team_line_up','team_data_set','lp','pdo2','button_area','spt_cs1','spt_cs1_c','stset_c'];
    if (!required.every(k=>typeof game[k]==='function') || !Array.isArray(game.team_pr) || !Array.isArray(game.team_color)) return false;
    original={
      teamData:game.team_data,
      teamLineUp:game.team_line_up,
      teamDataSet:game.team_data_set,
      lp:game.lp,
      pdo2:game.pdo2,
      sptCs1:game.spt_cs1,
      sptCs1C:game.spt_cs1_c,
      stsetC:game.stset_c,
      teamPr:game.team_pr.slice(),
      teamColor:game.team_color.slice()
    };
    // Restore first in the 9-11 range, because those slots are used by the original teams on the native page.
    for (const id of SLOT_IDS) {
      if (original.teamPr[id] === undefined) original.teamPr[id]='0000';
      if (original.teamColor[id] === undefined) original.teamColor[id]='#000';
    }
    // Initial selections are native teams. Any later remapping is represented by customBySlot.
    game.team_data=patchedTeamData;
    game.team_line_up=patchedLineup;
    game.team_data_set=patchedTeamDataSet;
    game.spt_cs1=patchedSptCs1;
    game.spt_cs1_c=patchedSptCs1C;
    game.stset_c=patchedStsetC;
    game.lp=patchedLp;
    game.pdo2=patchedPdo2;
    game.DYA_ORIGINAL_9_TEAMS_FIX={
      version:'3.0.2',
      active:true,
      teamNames:TEAMS.map(t=>t.name),
      get page(){return page;},
      get slotMap(){return Array.from(customBySlot.entries());},
      restore(){
        game.team_data=original.teamData;
        game.team_line_up=original.teamLineUp;
        game.team_data_set=original.teamDataSet;
        game.lp=original.lp;
        game.pdo2=original.pdo2;
        game.spt_cs1=original.sptCs1;
        game.spt_cs1_c=original.sptCs1C;
        game.stset_c=original.stsetC;
        for (let i=0;i<original.teamPr.length;i++) game.team_pr[i]=original.teamPr[i];
        for (let i=0;i<original.teamColor.length;i++) game.team_color[i]=original.teamColor[i];
        customBySlot.clear();
        this.active=false;
      }
    };
    installed=true;
    console.info('[DYA Original 9 Teams FIX] v3.0.2 installed; native IDs 0-11 are preserved.');
    return true;
  }

  let tries=0;
  const timer=window.setInterval(()=>{
    tries++;
    if (legacyConflict || install(window) || tries>=240) {
      window.clearInterval(timer);
      if (!installed && !legacyConflict) console.error('[DYA Original 9 Teams FIX] DYA native functions were not found. Use Tampermonkey @grant none / page context.');
    }
  },250);
})();
