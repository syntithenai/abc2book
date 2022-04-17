const abcjs = require('abcjs');
const Fraction = require('fractional').Fraction ;
var abc = `X: 8
T: John Ryan's
Z: NfldWhistler
S: https://thesession.org/tunes/441#setting34567
R: polka
M: 2/4
L: 1/8
K: Dmaj
A|:d,d "C"B/c'/d/B/|AF AF|[c:hi there everywone]dd B/c/d/B/|AF ED|
dd B/c/d/B/|[M:2/4]AF Ad/e/|[K:Gm] fd ec|1 d2 d2:|2 d2 dd/e/||
|:fd de/f/|gf ed/e/|fd Ad|fd/f/ a2|
fd de/f/|gf ed/e/|fd ec|1 d2 dd/e/:|2 d2 d2||`

abc=`
X: 1
T: 1. Drowsy Maggie
M:4/4
L:1/8
K:Edorian
R: reel
N: AKA: Drowsey Maggie, Drowsie Maggie, Drowsy Maggy, Maggie Tuirseach, Maggie's Drowsy
"Em"E2BE E2BE|E2BE "D"AFDF|"Em"E2BE B2Bc|dedB "D"AFDF||! "Em"EEBE dEBE|EEBE "D"AFDF|"Em"EEBE dEBE|dedB "D"AFDF||! "Em"EEB,D EB"D"AF|"Em"GABe "D"dBAF|"Em"EEB,D EB"D"AF|"Em"GAGF EDB,D||! EEB,D EB"D"AF|"Em"GABe "D"dBAF|"Em"EEB,D EB"D"AF|"Em"GAGF EDB,G,||! "Am"A,2EA, A,2EA,|A,2EA, "G"DB,G,B,|"Am"A,2EA, E2EF|GAGE "G"DB,G,B,||! "Am"A,A,EA, GA,EA,|A,A,EA, "G"DB,G,B,|"Am"A,A,EA, GA,EA,|DEDB, "G"DB,G,B,||! "Am"A,A,=CE AGE=C|A,A,=CE AGE=C|A,A,=CE ABAE|=cd=cA "Em"EDCB,||! "Am"A,A,=CE AGE=C|A,A,=CE AGE=C|A,A,=CE AB=cd|ed=ce "Em"BAGF||
% abc-sessionorg_id 27
% abc-sessionorg_setting 8
% abc-sessionorg_setting_id 12413
% abc-boost 0
undefined


`

 
function isOctaveModifier(letter) {
    return (letter === ',' || letter === "'") 
}

function multiplyAbcTiming(multiplier,abc) {
    var measures = abcjs.extractMeasures(abc)[0].measures
    var newMeasures = measures.map(function(m) {
      var abc = m.abc
      var c = 0
      var newAbc = []
      var inQuote = false
      var inCurlyBracket = false
      var inSquareBracket = false
      while (c < abc.length) {
        var symbol = abc[c]
        if (symbol === '"') {
            inQuote =!inQuote
        }
        if (symbol === '{') {
            inCurlyBracket = true
        }
        if (symbol === '}') {
            inCurlyBracket = false
        }
        if (symbol === '[') {
            inSquareBracket = true
        }
        if (symbol === ']') {
            inSquareBracket = false
        }
        var newSymbol = null
        var nextSymbol = abc[c+1]
        var nextNextSymbol = null
        var nextNextNextSymbol = null
        var modifier = ''
                    
        if (!inQuote && !inCurlyBracket && !inSquareBracket && isNoteLetter(symbol)) {
            if (c < abc.length + 1) {
                nextSymbol = abc[c+1]
                if (isOctaveModifier(nextSymbol)) {
                    modifier = abc[c+1]
                    nextSymbol = nextSymbol = abc[c+2]
                    if (c < abc.length + 3) {
                        nextNextSymbol = abc[c+3]
                        
                        if (c < abc.length + 4) {
                            nextNextNextSymbol = abc[c+4]
                        }
                    }
                    var result = symbolsToFraction(nextSymbol, nextNextSymbol,nextNextNextSymbol) 
                    //var f = decimalToFraction(result.number)
                    var asFraction = new Fraction(result.number.top,result.number.bottom)
                    var m = decimalToFraction(multiplier)
                    var multiplierFraction = new Fraction(m.top,m.bottom)
                    var finalFraction = asFraction.multiply(multiplierFraction)
                    
                    //console.log("multiply", [symbol ,nextSymbol, nextNextSymbol, nextNextNextSymbol], result.number ,"by multiplier ",multiplier, ' is ' ,finalFraction)
                    newAbc.push(symbol + modifier + abcFraction(finalFraction.numerator, finalFraction.denominator))
                    c = c + result.symbolsUsed  + 2
                } else {
                    if (c < abc.length + 2) {
                        nextNextSymbol = abc[c+2]
                        
                        if (c < abc.length + 3) {
                            nextNextNextSymbol = abc[c+3]
                        }
                    }
                    
                    var result = symbolsToFraction(nextSymbol, nextNextSymbol,nextNextNextSymbol) 
                    //var f = decimalToFraction(result.number)
                    //console.log('RES',result)
                    var asFraction = new Fraction(parseInt(result.number.top),parseInt(result.number.bottom))
                    //console.log('RESasf',asFraction)
                    var m = decimalToFraction(multiplier)
                    var multiplierFraction = new Fraction(parseInt(m.top),parseInt(m.bottom))
                    var finalFraction = asFraction.multiply(multiplierFraction)
                    //console.log("multiply", [symbol ,nextSymbol, nextNextSymbol, nextNextNextSymbol], result.number ,"by multiplier ",multiplier, ' is ' ,asFraction, finalFraction)
                    var abcf = abcFraction(finalFraction.numerator, finalFraction.denominator)
                    //console.log("multiply", finalFraction,modifier,abcf)
                    newAbc.push(symbol + abcf)
                    c = c + result.symbolsUsed  + 1
                }
            } else {
                newAbc.push(symbol)
                c++
            }
            
        } else {
            newAbc.push(symbol)
            c++
        }
      }
      console.log(newAbc)
      m.abc = newAbc.join('')
      return m 
    })
    return generateAbcFromMeasures(newMeasures)
}

function generateAbcFromMeasures(measures) {
    return measures.map(function(measure) {
        var abc = measure.abc
        return abc 
    }).join(" ")
}

// eg /4 becomes 0.25, /2 becomes 0.5, 4 becomes 4.0
function symbolsToFraction(a,b,c) {
    if (isSlash(a)) {
        if (isDigit(b)) {
            if (isDigit(c)) {
                var combined = parseInt(b + '' + c)
                return {symbolsUsed: 3, number: {top: 1, bottom: combined}}
            } else {
                return {symbolsUsed: 2, number: {top: 1, bottom: b}}
            }
        } else {
            return {symbolsUsed: 1, number: {top: 1, bottom: 2}}
        }
    } else {
        if (isDigit(a)) {
            if (isDigit(b)) {
                var combined = parseInt(a + '' + b)
                return {symbolsUsed: 2, number: {top: combined, bottom: 1}}
            } else {
                return {symbolsUsed: 1, number: {top: a, bottom: 1}}
            }
        } else {
            return {symbolsUsed: 0, number: {top: 1, bottom: 1}}
        }
    }
}

function gcd(a, b) {
	return (b) ? gcd(b, a % b) : a;
}

var decimalToFraction = function (_decimal) {
    //console.log('DECIMALTOFRACTION',_decimal)
    if (_decimal == parseInt(_decimal)) {
        var a = {
            top: parseInt(_decimal),
            bottom: 1,
            display: parseInt(_decimal) + '/' + 1
        };
        //console.log('DECIMALTOFRACTION ret a',a)
        return a
    }
    else {
        var top = _decimal.toString().includes(".") ? _decimal.toString().replace(/\d+[.]/, '') : 0;
        var bottom = Math.pow(10, top.toString().replace('-','').length);
        if (_decimal >= 1) {
            top = +top + (Math.floor(_decimal) * bottom);
        }
        else if (_decimal <= -1) {
            top = +top + (Math.ceil(_decimal) * bottom);
        }

        var x = Math.abs(gcd(top, bottom));
        var a = {
            top: (top / x),
            bottom: (bottom / x),
            display: (top / x) + '/' + (bottom / x)
        };
        //console.log('DECIMALTOFRACTION ret a',a)
        return a
    }
}

function abcFraction(top, bottom) {
    //console.log('abcfraction',top, bottom)
    if (bottom === 1) {
        if (top === 1) {
            //console.log('abcfraction ret empty top 1')
            return ''
        } else {
            //console.log('abcfraction ret top '+fraction.top)
            return top
        }
    } else {
        if (bottom === 2) {
            //console.log('abcfraction ret bottom is 2 ret /')
            return "/"
        } else {
            //console.log('abcfraction ret bottom '+fraction.bottom)
            return "/" + bottom
        }
    }
}


function isNoteLetter(a) {
    if ("zabcdefgABCDEFG".indexOf(a) !== -1) {
        return true
    } else {
        return false
    }
}
function isDigit(a) {
    if ("123456789".indexOf(a) !== -1) {
        return true
    } else {
        return false
    }
}
function isSlash(a) {
    if (a === "/") {
        return true
    } else {
        return false
    }
}



console.log(multiplyAbcTiming(process.argv[2] > 0 ? process.argv[2] : 1,abc))

