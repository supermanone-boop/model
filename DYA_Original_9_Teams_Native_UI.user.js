// ==UserScript==
// @name         DYA Original 9 Teams - Native Selector UI
// @namespace    https://dya.jp/d11/
// @version      2.1.0
// @description  追加9球団をDYA標準の球団選択画面・カード部品・クリック処理へ統合します。
// @match        https://dya.jp/d11/*
// @match        https://www.dya.jp/d11/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  const RAW = [{"name":"ウルブズ","en":"WOLVES","emoji":"🐺","style":"走攻守バランス型","tag":"堅実な総合力と走塁で押す","uniform":0,"logo":0,"color":"363b4b","positions":"234567891","players":[{"name":"黒瀬","bat":"8988","def":"5495864444","pitch":"333214222","appearance":"333214222*73*15*24*6*54*363b4b*0*0","role":"野手"},{"name":"三浦","bat":"6977","def":"5446678665","pitch":"524214113","appearance":"524214113*86*11*24*3*59*434343*0*0","role":"野手"},{"name":"相馬","bat":"9977","def":"7874946834","pitch":"413212321","appearance":"413212321*74*15*19*7*57*2f2f2f*0*0","role":"野手"},{"name":"久我","bat":"6965","def":"5885594464","pitch":"125211113","appearance":"125211113*82*16*25*5*60*5d1b05*0*0","role":"野手"},{"name":"早瀬","bat":"9679","def":"6877878446","pitch":"354232321","appearance":"354232321*80*13*22*9*52*6e4715*0*0","role":"野手"},{"name":"桐山","bat":"9669","def":"5763458778","pitch":"143413443","appearance":"143413443*81*14*27*3*60*574125*0*0","role":"野手"},{"name":"宮原","bat":"8886","def":"6444784875","pitch":"433221241","appearance":"433221241*82*15*27*3*56*6f625b*0*0","role":"野手"},{"name":"瀬戸","bat":"6858","def":"7565635867","pitch":"343133442","appearance":"343133442*83*11*24*4*52*685725*0*0","role":"野手"},{"name":"飯島","bat":"9988","def":"7767656655","pitch":"597674766","appearance":"597674766*82*13*26*3*59*363b4b*0*0","role":"先発"},{"name":"神谷","bat":"8656","def":"5469486454","pitch":"333322441","appearance":"333322441*69*12*25*4*52*b99036*0*0","role":"控え"},{"name":"杉浦","bat":"7768","def":"7766774664","pitch":"747347333","appearance":"747347333*68*15*22*8*59*363b4b*0*0","role":"救援候補"},{"name":"西森","bat":"6877","def":"6478484566","pitch":"442312331","appearance":"442312331*87*15*23*9*53*434343*0*0","role":"控え"},{"name":"高瀬","bat":"6686","def":"7635478455","pitch":"545422222","appearance":"545422222*84*15*25*6*58*2f2f2f*0*0","role":"控え"},{"name":"大森","bat":"7655","def":"7767676985","pitch":"745533434","appearance":"745533434*80*13*20*4*56*5d1b05*0*0","role":"救援候補"},{"name":"風間","bat":"5677","def":"6737664667","pitch":"213113411","appearance":"213113411*87*15*23*3*60*6e4715*0*0","role":"控え"},{"name":"成瀬","bat":"7685","def":"8846457556","pitch":"351424422","appearance":"351424422*82*16*23*6*56*574125*0*0","role":"控え"},{"name":"小野寺","bat":"7667","def":"4887453743","pitch":"588367444","appearance":"588367444*69*12*24*2*55*6f625b*0*0","role":"救援候補"},{"name":"石黒","bat":"6787","def":"5549868643","pitch":"243142112","appearance":"243142112*71*14*24*9*54*685725*0*0","role":"控え"},{"name":"片桐","bat":"8857","def":"6476684834","pitch":"313121113","appearance":"313121113*76*16*20*8*59*363b4b*0*0","role":"控え"},{"name":"浅野","bat":"5744","def":"4847784474","pitch":"566666565","appearance":"566666565*78*9*20*5*53*b99036*0*0","role":"救援候補"},{"name":"日野","bat":"6875","def":"5565689878","pitch":"658573647","appearance":"658573647*84*10*20*8*53*363b4b*0*0","role":"救援候補"}]},{"name":"パンサーズ","en":"PANTHERS","emoji":"🐆","style":"機動力・守備型","tag":"俊足と広い守備範囲が武器","uniform":1,"logo":1,"color":"2f2f2f","positions":"234567891","players":[{"name":"斎藤","bat":"8999","def":"6894465565","pitch":"553144412","appearance":"553144412*75*14*21*3*52*434343*0*0","role":"野手"},{"name":"真田","bat":"7999","def":"8859585455","pitch":"511223441","appearance":"511223441*72*11*20*3*54*2f2f2f*0*0","role":"野手"},{"name":"長岡","bat":"7987","def":"6784746877","pitch":"554424424","appearance":"554424424*84*10*27*2*60*5d1b05*0*0","role":"野手"},{"name":"朝倉","bat":"8919","def":"6987495657","pitch":"424311422","appearance":"424311422*70*9*23*8*59*6e4715*0*0","role":"野手"},{"name":"鳴海","bat":"5989","def":"5578679585","pitch":"321431242","appearance":"321431242*71*16*25*3*56*574125*0*0","role":"野手"},{"name":"藤森","bat":"7669","def":"5656765866","pitch":"442112124","appearance":"442112124*84*16*21*8*57*6f625b*0*0","role":"野手"},{"name":"榊原","bat":"8699","def":"4836444495","pitch":"333123231","appearance":"333123231*73*15*28*3*59*685725*0*0","role":"野手"},{"name":"佐伯","bat":"5879","def":"4554655859","pitch":"232132211","appearance":"232132211*75*16*20*3*59*363b4b*0*0","role":"野手"},{"name":"島村","bat":"5789","def":"6795676665","pitch":"886554578","appearance":"886554578*75*8*23*4*57*b99036*0*0","role":"先発"},{"name":"秋山","bat":"6767","def":"6857578453","pitch":"352441114","appearance":"352441114*78*14*20*6*54*2f2f2f*0*0","role":"控え"},{"name":"近藤","bat":"5889","def":"5788665476","pitch":"463365354","appearance":"463365354*87*14*22*8*52*434343*0*0","role":"救援候補"},{"name":"梶原","bat":"7789","def":"7954687567","pitch":"144234321","appearance":"144234321*88*10*23*4*56*2f2f2f*0*0","role":"控え"},{"name":"田淵","bat":"4678","def":"7855779865","pitch":"545142442","appearance":"545142442*77*16*26*8*53*5d1b05*0*0","role":"控え"},{"name":"平岡","bat":"7879","def":"6567868965","pitch":"554375453","appearance":"554375453*85*16*24*5*58*6e4715*0*0","role":"救援候補"},{"name":"竹内","bat":"5689","def":"8767575495","pitch":"215222212","appearance":"215222212*73*12*26*9*55*574125*0*0","role":"控え"},{"name":"黒田","bat":"6989","def":"5563737449","pitch":"141342132","appearance":"141342132*85*16*28*7*56*6f625b*0*0","role":"控え"},{"name":"宮本","bat":"3859","def":"6794584534","pitch":"455377346","appearance":"455377346*87*10*25*3*54*685725*0*0","role":"救援候補"},{"name":"梅原","bat":"7968","def":"8568565756","pitch":"425412212","appearance":"425412212*68*14*27*3*55*363b4b*0*0","role":"控え"},{"name":"村松","bat":"8778","def":"7857958475","pitch":"335221112","appearance":"335221112*68*8*25*4*58*b99036*0*0","role":"控え"},{"name":"中谷","bat":"5877","def":"8986765467","pitch":"465787545","appearance":"465787545*78*8*24*6*52*2f2f2f*0*0","role":"救援候補"},{"name":"国枝","bat":"7779","def":"7758788574","pitch":"867575525","appearance":"867575525*79*15*21*9*55*434343*0*0","role":"救援候補"}]},{"name":"ベアーズ","en":"BEARS","emoji":"🐻","style":"長打・パワー型","tag":"長打力と強肩で試合を動かす","uniform":2,"logo":2,"color":"5d1b05","positions":"234567891","players":[{"name":"熊谷","bat":"9844","def":"8498565636","pitch":"331234311","appearance":"331234311*75*8*23*7*53*2f2f2f*0*0","role":"野手"},{"name":"森","bat":"9774","def":"4876868743","pitch":"445121211","appearance":"445121211*84*8*20*6*58*5d1b05*0*0","role":"野手"},{"name":"岩田","bat":"9666","def":"4685687777","pitch":"233324131","appearance":"233324131*78*16*20*8*58*6e4715*0*0","role":"野手"},{"name":"岩本","bat":"9645","def":"5767498783","pitch":"133122411","appearance":"133122411*87*15*25*8*54*574125*0*0","role":"野手"},{"name":"岡本","bat":"9755","def":"6678858745","pitch":"555311222","appearance":"555311222*76*10*19*3*59*6f625b*0*0","role":"野手"},{"name":"牧野","bat":"9776","def":"4667855655","pitch":"233221222","appearance":"233221222*77*11*19*9*54*685725*0*0","role":"野手"},{"name":"北原","bat":"7583","def":"4857577668","pitch":"324424122","appearance":"324424122*88*12*23*6*58*363b4b*0*0","role":"野手"},{"name":"江藤","bat":"8674","def":"7833364649","pitch":"413211423","appearance":"413211423*86*8*22*2*58*b99036*0*0","role":"野手"},{"name":"大岩","bat":"8987","def":"5867584666","pitch":"988946576","appearance":"988946576*71*12*25*7*59*5d1b05*0*0","role":"先発"},{"name":"小松","bat":"8464","def":"7849874635","pitch":"453211113","appearance":"453211113*74*13*20*4*52*434343*0*0","role":"控え"},{"name":"橋本","bat":"9654","def":"6674876654","pitch":"956656565","appearance":"956656565*76*16*25*8*55*2f2f2f*0*0","role":"救援候補"},{"name":"安田","bat":"6532","def":"8785898666","pitch":"521241422","appearance":"521241422*71*16*22*7*57*5d1b05*0*0","role":"控え"},{"name":"柴崎","bat":"7652","def":"7867568578","pitch":"354322113","appearance":"354322113*69*12*23*9*56*6e4715*0*0","role":"控え"},{"name":"室井","bat":"9672","def":"7537556884","pitch":"558573345","appearance":"558573345*71*10*25*6*58*574125*0*0","role":"救援候補"},{"name":"関口","bat":"9764","def":"6436757587","pitch":"253342132","appearance":"253342132*72*14*20*7*54*6f625b*0*0","role":"控え"},{"name":"河野","bat":"8554","def":"5653674776","pitch":"513122311","appearance":"513122311*84*12*19*3*60*685725*0*0","role":"控え"},{"name":"大西","bat":"9652","def":"6864864435","pitch":"768454576","appearance":"768454576*79*13*27*7*57*363b4b*0*0","role":"救援候補"},{"name":"松浦","bat":"8562","def":"8489655575","pitch":"353121232","appearance":"353121232*72*12*27*5*57*b99036*0*0","role":"控え"},{"name":"吉野","bat":"9745","def":"6447685846","pitch":"535214312","appearance":"535214312*71*11*19*4*53*5d1b05*0*0","role":"控え"},{"name":"荒川","bat":"6562","def":"8848695477","pitch":"837435686","appearance":"837435686*83*16*22*9*56*434343*0*0","role":"救援候補"},{"name":"竹田","bat":"9575","def":"7645447465","pitch":"966875473","appearance":"966875473*73*10*23*6*52*2f2f2f*0*0","role":"救援候補"}]},{"name":"フォックス","en":"FOXES","emoji":"🦊","style":"巧打・制球型","tag":"ミート力と緻密な投球で崩す","uniform":3,"logo":3,"color":"b99036","positions":"234567891","players":[{"name":"狐塚","bat":"7978","def":"5595864333","pitch":"512214131","appearance":"512214131*73*16*28*2*57*5d1b05*0*0","role":"野手"},{"name":"狐崎","bat":"4998","def":"7547846766","pitch":"553312111","appearance":"553312111*77*8*24*3*59*6e4715*0*0","role":"野手"},{"name":"尾崎","bat":"5997","def":"4548968647","pitch":"432312321","appearance":"432312321*87*8*23*6*57*574125*0*0","role":"野手"},{"name":"井川","bat":"8929","def":"4845667485","pitch":"415124431","appearance":"415124431*70*14*19*2*52*6f625b*0*0","role":"野手"},{"name":"滝本","bat":"7997","def":"7455859888","pitch":"434321232","appearance":"434321232*81*16*22*8*53*685725*0*0","role":"野手"},{"name":"西川","bat":"5987","def":"6573578865","pitch":"244142322","appearance":"244142322*80*13*26*4*52*363b4b*0*0","role":"野手"},{"name":"岸本","bat":"4897","def":"5463368498","pitch":"544142121","appearance":"544142121*83*12*27*8*55*b99036*0*0","role":"野手"},{"name":"河原","bat":"4198","def":"6765336858","pitch":"121312122","appearance":"121312122*69*11*27*5*54*b99036*0*0","role":"野手"},{"name":"高木","bat":"8978","def":"5498564544","pitch":"597887946","appearance":"597887946*79*8*24*8*58*434343*0*0","role":"先発"},{"name":"吉岡","bat":"3894","def":"8778587434","pitch":"251112221","appearance":"251112221*77*16*26*8*59*2f2f2f*0*0","role":"控え"},{"name":"宇野","bat":"7998","def":"5576648655","pitch":"585775544","appearance":"585775544*85*9*25*5*58*5d1b05*0*0","role":"救援候補"},{"name":"大橋","bat":"6987","def":"5787497857","pitch":"235122414","appearance":"235122414*81*15*28*2*55*6e4715*0*0","role":"控え"},{"name":"上村","bat":"7777","def":"6838649564","pitch":"345341212","appearance":"345341212*68*13*21*9*53*574125*0*0","role":"控え"},{"name":"野口","bat":"6796","def":"8836765758","pitch":"494374736","appearance":"494374736*72*13*21*7*52*6f625b*0*0","role":"救援候補"},{"name":"福原","bat":"6998","def":"8876745497","pitch":"122141313","appearance":"122141313*72*13*25*3*52*685725*0*0","role":"控え"},{"name":"矢野","bat":"7877","def":"6653668446","pitch":"311411142","appearance":"311411142*86*8*20*5*56*363b4b*0*0","role":"控え"},{"name":"今村","bat":"5966","def":"7497443645","pitch":"576695476","appearance":"576695476*74*13*20*5*52*b99036*0*0","role":"救援候補"},{"name":"門田","bat":"6788","def":"5586744465","pitch":"215424412","appearance":"215424412*76*12*26*6*55*b99036*0*0","role":"控え"},{"name":"若林","bat":"6996","def":"4478845544","pitch":"411112242","appearance":"411112242*79*14*21*3*60*434343*0*0","role":"控え"},{"name":"水野","bat":"5795","def":"7754785547","pitch":"485574764","appearance":"485574764*70*9*21*3*54*2f2f2f*0*0","role":"救援候補"},{"name":"永井","bat":"4887","def":"7557777774","pitch":"598593667","appearance":"598593667*81*9*22*6*59*5d1b05*0*0","role":"救援候補"}]},{"name":"オルカス","en":"ORCAS","emoji":"🐋","style":"投手・コンタクト型","tag":"高い制球と変化球で主導権を握る","uniform":4,"logo":4,"color":"363b4b","positions":"234567891","players":[{"name":"海野","bat":"9976","def":"7495867346","pitch":"331224112","appearance":"331224112*71*15*26*2*57*6e4715*0*0","role":"野手"},{"name":"潮田","bat":"9987","def":"7749754477","pitch":"212142242","appearance":"212142242*69*16*22*5*60*574125*0*0","role":"野手"},{"name":"水島","bat":"8796","def":"4478857845","pitch":"142442223","appearance":"142442223*68*11*19*6*57*6f625b*0*0","role":"野手"},{"name":"沖田","bat":"6897","def":"8474697687","pitch":"413122323","appearance":"413122323*79*13*23*8*52*685725*0*0","role":"野手"},{"name":"浦野","bat":"9895","def":"6476449864","pitch":"515221322","appearance":"515221322*71*11*26*9*58*363b4b*0*0","role":"野手"},{"name":"浜崎","bat":"7695","def":"8547768848","pitch":"234121311","appearance":"234121311*84*15*20*8*60*b99036*0*0","role":"野手"},{"name":"湊","bat":"6986","def":"5676754774","pitch":"343242211","appearance":"343242211*68*8*23*9*56*363b4b*0*0","role":"野手"},{"name":"鮫島","bat":"8894","def":"7846757577","pitch":"233314223","appearance":"233314223*69*8*20*2*59*434343*0*0","role":"野手"},{"name":"波多野","bat":"9887","def":"5877866436","pitch":"996779549","appearance":"996779549*76*12*22*4*60*2f2f2f*0*0","role":"先発"},{"name":"早川","bat":"8654","def":"6579465664","pitch":"111142122","appearance":"111142122*84*15*24*8*54*5d1b05*0*0","role":"控え"},{"name":"相沢","bat":"6955","def":"4787754764","pitch":"676658356","appearance":"676658356*79*10*20*9*58*6e4715*0*0","role":"救援候補"},{"name":"白波","bat":"6783","def":"5775476746","pitch":"125123323","appearance":"125123323*68*14*24*5*57*574125*0*0","role":"控え"},{"name":"石浜","bat":"7756","def":"7857879848","pitch":"134124241","appearance":"134124241*74*8*23*9*54*6f625b*0*0","role":"控え"},{"name":"青木","bat":"5765","def":"4776655948","pitch":"555585435","appearance":"555585435*87*13*22*6*55*685725*0*0","role":"救援候補"},{"name":"岩瀬","bat":"6165","def":"6864786864","pitch":"343131132","appearance":"343131132*85*12*26*9*60*363b4b*0*0","role":"控え"},{"name":"梶谷","bat":"7774","def":"4766734758","pitch":"433131211","appearance":"433131211*78*13*19*2*58*b99036*0*0","role":"控え"},{"name":"長谷部","bat":"7787","def":"5768783456","pitch":"884668366","appearance":"884668366*81*10*28*5*57*363b4b*0*0","role":"救援候補"},{"name":"竹原","bat":"7955","def":"4776487554","pitch":"233211241","appearance":"233211241*77*14*19*9*58*434343*0*0","role":"控え"},{"name":"日高","bat":"6975","def":"4864946577","pitch":"311433131","appearance":"311433131*77*11*24*5*53*2f2f2f*0*0","role":"控え"},{"name":"船越","bat":"7863","def":"4558785846","pitch":"976467275","appearance":"976467275*87*14*24*5*57*5d1b05*0*0","role":"救援候補"},{"name":"小森","bat":"7595","def":"6478577644","pitch":"876547278","appearance":"876547278*86*13*28*7*55*6e4715*0*0","role":"救援候補"}]},{"name":"バイソンズ","en":"BISONS","emoji":"🦬","style":"パワー・堅守型","tag":"強打と内野の堅さを両立","uniform":5,"logo":11,"color":"574125","positions":"234567891","players":[{"name":"牛島","bat":"9866","def":"8794476634","pitch":"131234221","appearance":"131234221*87*13*20*7*55*574125*0*0","role":"野手"},{"name":"牛尾","bat":"8667","def":"5659648664","pitch":"452211222","appearance":"452211222*86*16*22*2*54*6f625b*0*0","role":"野手"},{"name":"黒岩","bat":"9975","def":"8568968863","pitch":"445132224","appearance":"445132224*86*15*25*7*55*685725*0*0","role":"野手"},{"name":"赤松","bat":"6846","def":"7585584643","pitch":"335222113","appearance":"335222113*85*12*21*3*54*363b4b*0*0","role":"野手"},{"name":"佐野","bat":"9867","def":"6575678858","pitch":"533212221","appearance":"533212221*77*9*23*4*57*b99036*0*0","role":"野手"},{"name":"大谷","bat":"8566","def":"4944768775","pitch":"314332242","appearance":"314332242*87*9*26*3*60*574125*0*0","role":"野手"},{"name":"石橋","bat":"9854","def":"5745366566","pitch":"335231233","appearance":"335231233*81*14*24*6*59*434343*0*0","role":"野手"},{"name":"桐谷","bat":"9967","def":"4854566657","pitch":"323412144","appearance":"323412144*84*11*26*5*60*2f2f2f*0*0","role":"野手"},{"name":"久保田","bat":"9998","def":"4976854535","pitch":"899566776","appearance":"899566776*73*14*24*7*55*5d1b05*0*0","role":"先発"},{"name":"白川","bat":"7653","def":"8977868444","pitch":"555113321","appearance":"555113321*68*15*21*7*59*6e4715*0*0","role":"控え"},{"name":"長田","bat":"8965","def":"8786977764","pitch":"959772564","appearance":"959772564*79*10*22*3*59*574125*0*0","role":"救援候補"},{"name":"藤田","bat":"5457","def":"4547767754","pitch":"531133411","appearance":"531133411*87*10*21*8*59*6f625b*0*0","role":"控え"},{"name":"末吉","bat":"8573","def":"8576586776","pitch":"132122421","appearance":"132122421*75*16*24*9*60*685725*0*0","role":"控え"},{"name":"瀬川","bat":"7754","def":"6646484964","pitch":"546536667","appearance":"546536667*86*10*22*8*60*363b4b*0*0","role":"救援候補"},{"name":"金子","bat":"9663","def":"8946356697","pitch":"343221111","appearance":"343221111*86*10*22*6*58*b99036*0*0","role":"控え"},{"name":"青山","bat":"7455","def":"6876435778","pitch":"213113132","appearance":"213113132*84*11*21*6*54*574125*0*0","role":"控え"},{"name":"望月","bat":"9864","def":"4977686443","pitch":"746854565","appearance":"746854565*82*16*22*3*52*434343*0*0","role":"救援候補"},{"name":"杉本","bat":"7436","def":"5658747467","pitch":"433121132","appearance":"433121132*73*11*21*6*55*2f2f2f*0*0","role":"控え"},{"name":"三宅","bat":"6557","def":"4746977735","pitch":"233411311","appearance":"233411311*79*9*21*9*56*5d1b05*0*0","role":"控え"},{"name":"小暮","bat":"6856","def":"8656785664","pitch":"989674763","appearance":"989674763*87*11*25*9*58*6e4715*0*0","role":"救援候補"},{"name":"岡崎","bat":"5655","def":"5965558478","pitch":"967633646","appearance":"967633646*74*13*19*5*53*574125*0*0","role":"救援候補"}]},{"name":"コブラズ","en":"COBRAS","emoji":"🐍","style":"変化球・技巧型","tag":"多彩な変化球と小技で揺さぶる","uniform":6,"logo":5,"color":"6e4715","positions":"234567891","players":[{"name":"蛇塚","bat":"7966","def":"8895663563","pitch":"334121132","appearance":"334121132*71*13*20*8*57*6f625b*0*0","role":"野手"},{"name":"蛇谷","bat":"5996","def":"8857447344","pitch":"343213123","appearance":"343213123*87*16*26*5*52*685725*0*0","role":"野手"},{"name":"早乙女","bat":"7868","def":"4464684754","pitch":"333221132","appearance":"333221132*77*14*20*6*53*363b4b*0*0","role":"野手"},{"name":"唐沢","bat":"4879","def":"5665864667","pitch":"344244312","appearance":"344244312*76*16*28*8*53*b99036*0*0","role":"野手"},{"name":"辰巳","bat":"6968","def":"7538886775","pitch":"123111142","appearance":"123111142*78*11*23*2*55*6e4715*0*0","role":"野手"},{"name":"龍崎","bat":"6677","def":"5764877954","pitch":"251123212","appearance":"251123212*71*15*20*7*59*434343*0*0","role":"野手"},{"name":"御子柴","bat":"4999","def":"4846365787","pitch":"231121141","appearance":"231121141*84*15*26*3*55*2f2f2f*0*0","role":"野手"},{"name":"堀内","bat":"4899","def":"5645647449","pitch":"254432213","appearance":"254432213*82*9*23*6*59*5d1b05*0*0","role":"野手"},{"name":"岸","bat":"8968","def":"8576475574","pitch":"775968496","appearance":"775968496*75*13*28*7*57*6e4715*0*0","role":"先発"},{"name":"横山","bat":"6896","def":"7487847473","pitch":"544123412","appearance":"544123412*79*12*28*5*55*574125*0*0","role":"控え"},{"name":"宮下","bat":"7954","def":"6675956454","pitch":"566858494","appearance":"566858494*80*16*24*3*56*6f625b*0*0","role":"救援候補"},{"name":"徳永","bat":"4888","def":"8684694645","pitch":"431312243","appearance":"431312243*68*8*24*2*55*685725*0*0","role":"控え"},{"name":"桜井","bat":"5777","def":"5458789458","pitch":"532244132","appearance":"532244132*86*9*24*9*58*363b4b*0*0","role":"控え"},{"name":"川上","bat":"6577","def":"8774475855","pitch":"468676478","appearance":"468676478*69*14*20*3*56*b99036*0*0","role":"救援候補"},{"name":"守屋","bat":"4854","def":"5444787676","pitch":"533111222","appearance":"533111222*83*15*23*5*58*6e4715*0*0","role":"控え"},{"name":"相原","bat":"7654","def":"7477648489","pitch":"353432111","appearance":"353432111*85*14*26*6*56*434343*0*0","role":"控え"},{"name":"石田","bat":"7886","def":"4885776676","pitch":"566787558","appearance":"566787558*85*13*23*2*52*2f2f2f*0*0","role":"救援候補"},{"name":"二階堂","bat":"4886","def":"8458456557","pitch":"531433214","appearance":"531433214*85*16*23*8*60*5d1b05*0*0","role":"控え"},{"name":"大崎","bat":"6687","def":"5575957677","pitch":"343421212","appearance":"343421212*72*15*23*8*58*6e4715*0*0","role":"控え"},{"name":"山岸","bat":"6866","def":"6887797746","pitch":"888984676","appearance":"888984676*84*16*20*6*56*574125*0*0","role":"救援候補"},{"name":"久米","bat":"3676","def":"4668679788","pitch":"786756586","appearance":"786756586*88*14*22*8*55*6f625b*0*0","role":"救援候補"}]},{"name":"ホーネッツ","en":"HORNETS","emoji":"🐝","style":"俊足・高回転型","tag":"機動力とテンポの速い投球が持ち味","uniform":7,"logo":1,"color":"b99036","positions":"234567891","players":[{"name":"蜂須賀","bat":"8991","def":"8487767653","pitch":"453222442","appearance":"453222442*74*11*24*3*52*685725*0*0","role":"野手"},{"name":"蜂谷","bat":"8889","def":"8469447543","pitch":"342212131","appearance":"342212131*81*8*21*3*52*363b4b*0*0","role":"野手"},{"name":"羽賀","bat":"8119","def":"6645944877","pitch":"431324214","appearance":"431324214*87*12*20*8*55*b99036*0*0","role":"野手"},{"name":"戸田","bat":"6679","def":"6778575475","pitch":"314142141","appearance":"314142141*72*10*21*7*58*b99036*0*0","role":"野手"},{"name":"小泉","bat":"6969","def":"6665579564","pitch":"535341234","appearance":"535341234*74*16*27*6*59*434343*0*0","role":"野手"},{"name":"鈴村","bat":"6899","def":"5467544957","pitch":"232113433","appearance":"232113433*77*8*24*7*57*2f2f2f*0*0","role":"野手"},{"name":"長尾","bat":"4989","def":"8757388767","pitch":"325112314","appearance":"325112314*86*14*19*5*57*5d1b05*0*0","role":"野手"},{"name":"白井","bat":"4789","def":"7434754488","pitch":"431114413","appearance":"431114413*80*11*28*7*59*6e4715*0*0","role":"野手"},{"name":"高野","bat":"5899","def":"4598775677","pitch":"666679575","appearance":"666679575*85*13*24*2*52*574125*0*0","role":"先発"},{"name":"田島","bat":"6568","def":"7846485665","pitch":"213142113","appearance":"213142113*88*10*28*2*58*6f625b*0*0","role":"控え"},{"name":"倉持","bat":"7677","def":"5558765534","pitch":"875668453","appearance":"875668453*72*9*28*8*55*685725*0*0","role":"救援候補"},{"name":"新井","bat":"3769","def":"7468696645","pitch":"333313212","appearance":"333313212*69*12*24*8*58*363b4b*0*0","role":"控え"},{"name":"須藤","bat":"6768","def":"7447447447","pitch":"354132441","appearance":"354132441*80*13*26*6*53*b99036*0*0","role":"控え"},{"name":"吉村","bat":"5891","def":"8746856775","pitch":"775758565","appearance":"775758565*70*16*27*3*57*b99036*0*0","role":"救援候補"},{"name":"大槻","bat":"6667","def":"8746444698","pitch":"334413442","appearance":"334413442*81*13*22*3*57*434343*0*0","role":"控え"},{"name":"木村","bat":"4889","def":"8764645689","pitch":"133241211","appearance":"133241211*70*13*22*5*59*2f2f2f*0*0","role":"控え"},{"name":"谷口","bat":"5758","def":"4596664554","pitch":"673764553","appearance":"673764553*75*8*20*6*53*5d1b05*0*0","role":"救援候補"},{"name":"笠原","bat":"6789","def":"5549455336","pitch":"553332212","appearance":"553332212*77*14*20*3*55*6e4715*0*0","role":"控え"},{"name":"野村","bat":"7781","def":"5765675635","pitch":"412121241","appearance":"412121241*83*11*20*2*52*574125*0*0","role":"控え"},{"name":"富田","bat":"6579","def":"7845894775","pitch":"597555624","appearance":"597555624*88*12*23*7*57*6f625b*0*0","role":"救援候補"},{"name":"神田","bat":"5886","def":"7777578558","pitch":"475547665","appearance":"475547665*80*12*19*8*60*685725*0*0","role":"救援候補"}]},{"name":"コヨーテズ","en":"COYOTES","emoji":"🐺","style":"バランス・対応型","tag":"穴の少ない選手層で柔軟に戦う","uniform":8,"logo":3,"color":"6f625b","positions":"234567891","players":[{"name":"遠山","bat":"7788","def":"7786547555","pitch":"144113112","appearance":"144113112*87*14*21*7*58*363b4b*0*0","role":"野手"},{"name":"野沢","bat":"8876","def":"4887467657","pitch":"123124232","appearance":"123124232*87*16*28*5*60*b99036*0*0","role":"野手"},{"name":"桐生","bat":"9697","def":"6775984573","pitch":"551341411","appearance":"551341411*70*8*24*5*53*6f625b*0*0","role":"野手"},{"name":"千田","bat":"7689","def":"8484497744","pitch":"145114111","appearance":"145114111*70*13*21*9*52*434343*0*0","role":"野手"},{"name":"高井","bat":"9956","def":"6675459775","pitch":"354221131","appearance":"354221131*73*11*20*2*54*2f2f2f*0*0","role":"野手"},{"name":"梶","bat":"6669","def":"8454755644","pitch":"533322412","appearance":"533322412*70*10*21*2*60*5d1b05*0*0","role":"野手"},{"name":"川崎","bat":"7889","def":"6846767495","pitch":"251123112","appearance":"251123112*74*12*21*5*55*6e4715*0*0","role":"野手"},{"name":"沢村","bat":"8779","def":"4633437779","pitch":"324142441","appearance":"324142441*81*11*27*7*52*574125*0*0","role":"野手"},{"name":"平田","bat":"9756","def":"4795447376","pitch":"687967476","appearance":"687967476*86*13*23*5*58*6f625b*0*0","role":"先発"},{"name":"大竹","bat":"4578","def":"6486548434","pitch":"433234211","appearance":"433234211*77*9*25*5*52*685725*0*0","role":"控え"},{"name":"栗原","bat":"7887","def":"5475644777","pitch":"857856443","appearance":"857856443*71*14*23*5*53*363b4b*0*0","role":"救援候補"},{"name":"三好","bat":"6665","def":"4848685657","pitch":"332321211","appearance":"332321211*71*10*19*4*57*b99036*0*0","role":"控え"},{"name":"板倉","bat":"8677","def":"4768556756","pitch":"323344213","appearance":"323344213*77*16*22*5*56*6f625b*0*0","role":"控え"},{"name":"榎本","bat":"7785","def":"5564785888","pitch":"745768564","appearance":"745768564*86*11*24*2*57*434343*0*0","role":"救援候補"},{"name":"長谷川","bat":"7766","def":"4556448497","pitch":"255144341","appearance":"255144341*74*13*21*3*57*2f2f2f*0*0","role":"控え"},{"name":"内田","bat":"5578","def":"5677536588","pitch":"134334323","appearance":"134334323*75*13*21*5*57*5d1b05*0*0","role":"控え"},{"name":"小田","bat":"8577","def":"4498446647","pitch":"774584566","appearance":"774584566*84*16*20*5*55*6e4715*0*0","role":"救援候補"},{"name":"永田","bat":"6785","def":"7468675633","pitch":"353242143","appearance":"353242143*84*16*24*9*55*574125*0*0","role":"控え"},{"name":"岩井","bat":"6879","def":"6658866736","pitch":"221222412","appearance":"221222412*72*12*26*7*54*6f625b*0*0","role":"控え"},{"name":"鷲見","bat":"8478","def":"6478865544","pitch":"676666364","appearance":"676666364*80*11*28*3*57*685725*0*0","role":"救援候補"},{"name":"矢島","bat":"7547","def":"4874469756","pitch":"665876767","appearance":"665876767*87*15*19*6*59*363b4b*0*0","role":"救援候補"}]}];

  const BASE_ID = 12;
  const TEAM_BY_ID = new Map(RAW.map((team, index) => [BASE_ID + index, team]));
  const isCustomTeam = id => TEAM_BY_ID.has(Number(id));
  const styleId = id => TEAM_BY_ID.get(Number(id))?.uniform ?? Number(id);
  const logoId = id => TEAM_BY_ID.get(Number(id))?.logo ?? Number(id);
  const PAGE_BUTTON_BASE = 1920;
  const PAGE_LABELS = ['公式12球団', '追加 1/3', '追加 2/3', '追加 3/3'];
  const CARD_X = [19, 173, 327, 481];
  const CARD_CENTER_X = [89, 243, 397, 551];
  const CARD_ROW_Y = [227, 349, 472];
  const CARD_CODES = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011];

  let original = null;
  let installed = false;
  let pageState = 0; // 0 = stock 12 teams, 1-3 = 3 groups of custom teams
  const renderTeamBySlot = new Map();

  function averageDigits(values) {
    const digits = [];
    for (const value of values) {
      for (const char of String(value || '')) {
        const n = Number(char);
        if (Number.isFinite(n)) digits.push(n);
      }
    }
    return digits.length ? digits.reduce((a, b) => a + b, 0) / digits.length : 0;
  }

  function ratingDigit(value, min = 0, max = 9) {
    return String(Math.max(0, Math.min(5, Math.round(((value - min) / (max - min)) * 5))));
  }

  function teamRating(team) {
    const bat = averageDigits(team.players.map(p => p.bat));
    const def = averageDigits(team.players.map(p => p.def));
    const pitch = averageDigits(team.players.map(p => p.pitch));
    const run = team.players.reduce((sum, p) => sum + (Number((p.appearance || '').split('*')[1]) || 0), 0) / team.players.length;
    return ratingDigit(bat) + ratingDigit(def) + ratingDigit(pitch) + ratingDigit(run, 55, 95);
  }

  function makeRecord(player) {
    // DYA's native roster record: name#14 batting/defense digits#pitch/appearance#/skill-count
    return `${player.name}#${player.bat}${player.def}#${player.appearance}#/0`;
  }

  function recordsFor(teamId) {
    const team = TEAM_BY_ID.get(Number(teamId));
    if (!team) throw new Error('Unknown custom team id: ' + teamId);
    return team.players.map(player => makeRecord(player) + '#2');
  }

  function patchedTeamLineUp(id) {
    const team = TEAM_BY_ID.get(Number(id));
    if (!team) return original.teamLineUp.apply(this, arguments);
    const symbols = '0123456789ABCDEFGHIJK';
    return team.players.map((player, index) => `#${symbols[index]}#${player.name}`).join('');
  }

  function patchedTeamData(id, mode) {
    const team = TEAM_BY_ID.get(Number(id));
    if (!team) return original.teamData.apply(this, arguments);
    const records = team.players.map(makeRecord);
    const numericMode = Number(mode);
    if (numericMode > 99) {
      const playerIndex = numericMode - 100;
      return records[playerIndex] ? records[playerIndex] + '#2' : '';
    }
    if (numericMode === 1) {
      const playerSide = Number(window.my_tb) === 1 ? 1 : 0;
      const cpuSide = 1 - playerSide;
      window.team_data_set(cpuSide, records.map(record => record + '#2'), team.positions);
      return;
    }
    window.plr_dat = records.map(record => record + '#2');
    window.shibi_ps = team.positions;
    return;
  }

  function patchedTeamDataSet(side, roster, positions) {
    const oldLeft = window.team_l;
    const oldRight = window.team_r;
    try {
      if (Number(side) === 0 && isCustomTeam(oldLeft)) window.team_l = styleId(oldLeft);
      if (Number(side) === 1 && isCustomTeam(oldRight)) window.team_r = styleId(oldRight);
      return original.teamDataSet.apply(this, arguments);
    } finally {
      window.team_l = oldLeft;
      window.team_r = oldRight;
    }
  }

  function patchedLogo(id) {
    const numericId = Number(id);
    const mappedTeamId = renderTeamBySlot.get(numericId);
    if (mappedTeamId !== undefined) {
      const team = TEAM_BY_ID.get(mappedTeamId);
      return original.myLogo.call(this, team ? team.logo : numericId);
    }
    return original.myLogo.call(this, logoId(numericId));
  }

  function prepareRenderSlots(game, actualLeft, actualRight) {
    const occupied = new Set();
    if (!isCustomTeam(actualLeft) && actualLeft >= 9 && actualLeft <= 11) occupied.add(actualLeft);
    if (!isCustomTeam(actualRight) && actualRight >= 9 && actualRight <= 11) occupied.add(actualRight);
    const saved = [];

    function mapOne(id) {
      if (!isCustomTeam(id)) return id;
      const slot = [9, 10, 11].find(candidate => !occupied.has(candidate));
      if (slot === undefined) return id;
      occupied.add(slot);
      const team = TEAM_BY_ID.get(Number(id));
      saved.push({ slot, rating: game.team_pr[slot], color: game.team_color[slot] });
      game.team_pr[slot] = game.team_pr[Number(id)] || teamRating(team);
      game.team_color[slot] = game.team_color[Number(id)] || ('#' + team.color);
      renderTeamBySlot.set(slot, Number(id));
      return slot;
    }

    const renderLeft = mapOne(actualLeft);
    const renderRight = mapOne(actualRight);
    game.team_l = renderLeft;
    game.team_r = renderRight;
    return function restore() {
      game.team_l = actualLeft;
      game.team_r = actualRight;
      for (const item of saved) {
        game.team_pr[item.slot] = item.rating;
        game.team_color[item.slot] = item.color;
      }
      renderTeamBySlot.clear();
    };
  }

  function selectorOffset(game) {
    const scale = Number(game.ltl) || 1;
    let offset = Number(game.wh) / scale / 2 - 272;
    if (String(game.sv_conf || '') !== '') {
      offset -= 16;
      if (Number(game.wh) / Number(game.ww) > 1.5) offset -= 32;
    }
    return offset;
  }

  function drawNativeCard(game, slot, yOffset, teamId = null) {
    const row = Math.floor(slot / 4);
    const col = slot % 4;
    const x = CARD_X[col];
    const y = CARD_ROW_Y[row] + yOffset;
    const centerX = CARD_CENTER_X[col];

    // lp() has already registered the native hit area for this exact slot.
    // Redraw only the native sprite here to avoid duplicate hit boxes.
    game.spt_cs1(187, x, y, 1);

    const logoSprite = teamId === null
      ? original.myLogo.call(game, slot)
      : game.myt_logo(teamId);
    game.spt_cs1_c(logoSprite, centerX, y + 44, 0.75);

    if (teamId !== null) {
      const team = TEAM_BY_ID.get(Number(teamId));
      const ctx = game.ctx;
      const scale = Number(game.ltl) || 1;
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `bold ${16 * scale}px sans-serif`;
      ctx.fillText(team.name, centerX * scale, (y + 107) * scale, 142 * scale);
      ctx.restore();
    }
  }

  function drawSelectionFrame(game, slot, yOffset) {
    const col = slot % 4;
    const row = Math.floor(slot / 4);
    const slotX = slot * 154;
    let highlightX = slotX;
    let highlightY = 9;
    if (slot > 7) {
      highlightX -= 154 * 8;
      highlightY = 123 * 2 + 8;
    } else if (slot > 3) {
      highlightX -= 154 * 4;
      highlightY = 123 + 8;
    }
    game.spt_cs1(188, 16 + highlightX, 215 + yOffset + highlightY, 1);
    game.spt_cs1(189, 132 + highlightX, 215 + yOffset + highlightY, 1);
    game.spt_cs1(190, 16 + highlightX, 306 + yOffset + highlightY, 1);
    game.spt_cs1(191, 132 + highlightX, 306 + yOffset + highlightY, 1);
  }

  function drawPageTabs(game, offset) {
    const ctx = game.ctx;
    const scale = Number(game.ltl) || 1;
    const x0 = 188;
    const y = 174 + offset;
    const width = 66;
    const height = 27;
    ctx.save();
    for (let i = 0; i < PAGE_LABELS.length; i++) {
      const x = x0 + i * 66;
      const active = pageState === i;
      ctx.fillStyle = active ? '#d5a70d' : '#484848';
      ctx.fillRect(x * scale, y * scale, width * scale, height * scale);
      ctx.strokeStyle = active ? '#fff1a8' : '#b5b5b5';
      ctx.lineWidth = 1 * scale;
      ctx.strokeRect((x + 0.5) * scale, (y + 0.5) * scale, (width - 1) * scale, (height - 1) * scale);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${11 * scale}px sans-serif`;
      ctx.fillText(PAGE_LABELS[i], (x + width / 2) * scale, (y + height / 2) * scale, (width - 4) * scale);
      game.button_area(PAGE_BUTTON_BASE + i, x, y, width, height);
    }
    ctx.restore();
  }

  function drawSelectorExtension(game, actualLeft, actualRight, renderSlots) {
    if (Number(game.run_mode) !== 2 || !game.ctx) return;
    const offset = selectorOffset(game);

    if (pageState === 0) {
      // If a custom team is selected while viewing the stock page, native lp()
      // temporarily highlighted a placeholder slot. Redraw just those stock cards
      // to remove that false highlight while keeping their native buttons active.
      for (const slot of renderSlots) drawNativeCard(game, slot, offset, null);
    } else {
      const firstTeamIndex = (pageState - 1) * 3;
      for (let i = 0; i < 3; i++) {
        const slot = 9 + i;
        drawNativeCard(game, slot, offset, BASE_ID + firstTeamIndex + i);
      }

      const activeTeam = Number(game.select_team_lr) === 1 ? Number(actualRight) : Number(actualLeft);
      const activeTeamIndex = activeTeam - BASE_ID;
      if (isCustomTeam(activeTeam) && Math.floor(activeTeamIndex / 3) === pageState - 1) {
        drawSelectionFrame(game, 9 + (activeTeamIndex % 3), offset);
      }
    }
    drawPageTabs(game, offset);
  }

  function patchedLp() {
    const actualLeft = Number(window.team_l);
    const actualRight = Number(window.team_r);
    const renderSlots = [];
    const restore = Number(window.run_mode) === 2
      ? prepareRenderSlots(window, actualLeft, actualRight)
      : () => {};
    for (const slot of renderTeamBySlot.keys()) renderSlots.push(slot);
    try {
      const result = original.lp.apply(this, arguments);
      drawSelectorExtension(window, actualLeft, actualRight, renderSlots);
      return result;
    } finally {
      restore();
    }
  }

  function patchedPdo2() {
    if (Number(window.run_mode) === 2) {
      const code = Number(window.onflg);
      if (code >= PAGE_BUTTON_BASE && code < PAGE_BUTTON_BASE + 4) {
        pageState = code - PAGE_BUTTON_BASE;
        if (typeof window.sndf === 'function') window.sndf(1, 0.06);
        if (typeof window.btn_reset === 'function') window.btn_reset();
        return;
      }

      if (code >= 1000 && code <= 1011 &&
          (pageState !== 0 || isCustomTeam(window.team_l) || isCustomTeam(window.team_r))) {
        const slot = code - 1000;
        let selectedTeamId = slot;
        if (pageState > 0 && slot >= 9) {
          selectedTeamId = BASE_ID + (pageState - 1) * 3 + (slot - 9);
        }
        if (Number(window.select_team_lr) === 0) window.team_l = selectedTeamId;
        else window.team_r = selectedTeamId;
        if (typeof window.sndf === 'function') window.sndf(4, 0.1);
        if (typeof window.btn_reset === 'function') window.btn_reset();
        return;
      }

      // pdo2() clamps team_l/team_r to 0..11 after most selector actions.
      // Keep custom IDs intact for native side-switch, CPU-level and start buttons.
      if (isCustomTeam(window.team_l) || isCustomTeam(window.team_r)) {
        const actualLeft = Number(window.team_l);
        const actualRight = Number(window.team_r);
        const restore = prepareRenderSlots(window, actualLeft, actualRight);
        try {
          return original.pdo2.apply(this, arguments);
        } finally {
          restore();
        }
      }
    }
    return original.pdo2.apply(this, arguments);
  }

  function install(game) {
    if (installed) return true;
    const requiredFunctions = [
      'team_data', 'team_line_up', 'team_data_set', 'myt_logo', 'lp', 'pdo2',
      'button_area', 'spt_cs1_c', 'spt_cs1'
    ];
    if (!requiredFunctions.every(name => typeof game[name] === 'function') ||
        !Array.isArray(game.team_pr) || !Array.isArray(game.team_color)) return false;

    original = {
      teamData: game.team_data,
      teamLineUp: game.team_line_up,
      teamDataSet: game.team_data_set,
      myLogo: game.myt_logo,
      lp: game.lp,
      pdo2: game.pdo2,
      teamPr: game.team_pr.slice(),
      teamColor: game.team_color.slice()
    };

    for (const [id, team] of TEAM_BY_ID) {
      game.team_pr[id] = teamRating(team);
      game.team_color[id] = '#' + team.color;
    }

    game.team_line_up = patchedTeamLineUp;
    game.team_data = patchedTeamData;
    game.team_data_set = patchedTeamDataSet;
    game.myt_logo = patchedLogo;
    game.lp = patchedLp;
    game.pdo2 = patchedPdo2;

    game.DYA_ORIGINAL_9_TEAMS = {
      version: '2.1.0',
      active: true,
      page: 'official',
      teamIds: Array.from(TEAM_BY_ID.keys()),
      restore: function () {
        game.team_data = original.teamData;
        game.team_line_up = original.teamLineUp;
        game.team_data_set = original.teamDataSet;
        game.myt_logo = original.myLogo;
        game.lp = original.lp;
        game.pdo2 = original.pdo2;
        game.team_pr.length = original.teamPr.length;
        game.team_color.length = original.teamColor.length;
        for (let i = 0; i < original.teamPr.length; i++) game.team_pr[i] = original.teamPr[i];
        for (let i = 0; i < original.teamColor.length; i++) game.team_color[i] = original.teamColor[i];
        game.DYA_ORIGINAL_9_TEAMS.active = false;
      },
      setPage: function (page) {
        const n = Math.max(0, Math.min(3, Number(page) || 0));
        pageState = n;
        game.DYA_ORIGINAL_9_TEAMS.page = n === 0 ? 'official' : `extra-${n}`;
        if (typeof game.btn_reset === 'function') game.btn_reset();
      }
    };

    installed = true;
    console.info('[DYA Original 9 Teams] Native selector integration v2.1.0 ready.');
    return true;
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts++;
    if (install(window) || attempts >= 120) {
      window.clearInterval(timer);
      if (!installed) console.error('[DYA Original 9 Teams] DYA native functions were not detected. Confirm the page is https://dya.jp/d11/ and reload.');
    }
  }, 250);
})();
