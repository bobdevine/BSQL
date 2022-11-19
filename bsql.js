'use strict';

const contextTypeEnum = {
    GET : "GET_STMT",
    DELETE : "DELETE_STMT",
    INSERT : "INSERT_STMT",
    UPDATE : "UPDATE_STMT"
};
const joinTypeEnum = {
    INNER_JOIN : "INNER JOIN",
    OUTER_JOIN : "OUTER JOIN",
    LEFT_OUTER_JOIN : "LEFT OUTER JOIN",
    RIGHT_OUTER_JOIN : "RIGHT OUTER JOIN",
};

// 1) parse source code into parse tree
// 2) generate SQL from the parse tree
function BSQL_Transpile(str) {
    let lexer = new BSQL_Lexer();
    let parser = new BSQL_Parser(lexer);
    let context = parser.parse(str);
    if (!context) {
	return "ERROR - query syntax";
    }
    return context.toString();
}



//----------------------------------------------------------
function QueryContext() {
    this.distinct = null;
    this.match = null;
    this.order = null;
    this.limit = null;
    this.queryType = null;
    //console.log("QueryContext() create");
}
QueryContext.prototype.toString = function() {
    let str =  "";

    switch (this.queryType) {
    case contextTypeEnum.GET:
	str += "SELECT ";
	if (!this.columns) {
	    str += "*"
	} else {
	    for (let i=0; i< this.columns.length; i++) {
		if (i >= 1) { str += ", "; }
		let f = this.columns[i];
		let pos = f.indexOf('.');
		if (pos < 0) {
		    str += f;
		} else {
		    if (this.from_table && this.from_table instanceof AST_Node_Join) {
			str += this.from_table.table_left + f.slice(pos);
		    } else {
			str += f;
		    }
		}
	    }
	}
	//console.log("  ++ ", str);

	str += " FROM ";
	if (!this.from_table) {
	    str += "[missing TABLE for SELECT]";
	    break;
	}
	str += this.from_table.toString();
	if (this.match) {
	    str += " WHERE ";
	    str += this.match.toString();
	}
	break;
	
    case contextTypeEnum.INSERT:
	str += "INSERT ";
	break;
    case contextTypeEnum.UPDATE:
	str += "UPDATE ";
	break;
    case contextTypeEnum.DELETE:
	str += "DELETE ";
	break;
    default:
	str = "UNKNOWN query";
    }
    
    //console.log("  +++ ", str);
    return str;
}


function AST_Node_Join(table_left, table_right, table_alias, join_type) {
    this.table_left = table_left;
    this.table_right = table_right;
    this.table_alias = table_alias;
    this.join_type = join_type;
    this.join_predicate;
}
AST_Node_Join.prototype.toString = function() {
    var ret = "";
    if (this.table_left != null) {
	ret += this.table_left;
    }
    switch (this.join_type) {
    case joinTypeEnum.INNER_JOIN : ret += " INNER JOIN "; break;
    case joinTypeEnum.OUTER_JOIN : ret += " OUTER JOIN "; break;
    case joinTypeEnum.LEFT_OUTER_JOIN : ret += " LEFT OUTER JOIN "; break;
    case joinTypeEnum.RIGHT_OUTER_JOIN : ret += " RIGHT OUTER JOIN "; break;
    default: ret += " JOIN ";
    }
    if (this.table_right != null) {
	ret += this.table_right;
    }
    if (this.table_alias) {
	// rewrite the SELECT dotted-name variables
        //ret += " AS " + this.table_alias;
    }

    if (this.join_predicate != null) {
	ret += " ON " + this.join_predicate.toString();
    } else {
	ret += " [missing ON predicate]";
    }
    return ret;
};

function AST_Node_Table(name, alias) {
    this.name = name;
    this.alias = alias != null ? alias : null;
}
AST_Node_Table.prototype.toString = function() {
    if (this.alias) {
        return this.name + " " + this.alias;
    } else {
        return this.name;
    }
};

function AST_Node_Binary() {
    this.op;
    this.left;
    this.right;
}
AST_Node_Binary.prototype.toString = function() {
    let str = this.left.toString();
    switch (this.op) {
    case "LEX_EQUAL" : str += " = "; break;
    case "LEX_LESS" : str += " < "; break;
    case "LEX_NOT_EQUAL" : str += " != "; break;
    case "LEX_GREATER" : str += " > "; break;
    case "LEX_PLUS" : str += " + "; break;
    case "LEX_MINUS" : str += " - "; break;
    case "LEX_KEYWORD_AND" : str += " AND "; break;
    case "LEX_KEYWORD_OR" : str += " OR "; break;
    default: str += " ?" + this.op + "? ";
    }
    str += this.right.toString();
    return str;
};

function AST_Node_Primary() {
    this.type;
    this.value;
}
AST_Node_Primary.prototype.toString = function() {
    return this.value;
};


//----------------------------------------------------------
// context-free tokenizing lexer
function BSQL_Lexer() {
    var tokens = [];    
    const rules = [
	{"type": "LEX_WHITESPACE", "pattern": /^\s+/},
	{"type": "LEX_PAREN_OPEN", "pattern": /^\(/},
	{"type": "LEX_PAREN_CLOSE", "pattern": /^\)/},
	{"type": "LEX_BRACE_OPEN", "pattern": /^\{/},
	{"type": "LEX_BRACE_CLOSE", "pattern": /^\}/},
	{"type": "LEX_BRACKET_OPEN", "pattern": /^\[/},
	{"type": "LEX_BRACKET_CLOSE", "pattern": /^\]/},
	{"type": "LEX_PERIOD", "pattern": /^\./},
	{"type": "LEX_COMMA", "pattern": /^,/},
	{"type": "LEX_LESS", "pattern": /^\</},
	{"type": "LEX_GREATER", "pattern": /^\>/},
	{"type": "LEX_EQUAL", "pattern": /^=/},
	{"type": "LEX_NOT_EQUAL", "pattern": /^\!=/},
	{"type": "LEX_STAR", "pattern": /^\*/},
	{"type": "LEX_PLUS", "pattern": /^\+/},
	{"type": "LEX_MINUS", "pattern": /^\-/},
	{"type": "LEX_NUM_FLOAT", "pattern": /^-?\d+\.\d+/},
	{"type": "LEX_NUM_INT", "pattern": /^-?\d+/},
	{"type": "LEX_COMMENT_BLOCK", "pattern": /^\/\*/, "action": function(input, i) {
	    //console.log("action /* : input = '" + input + "'");
	    //console.log("action : i = " + i);
	    let matchLength = i;
	    while (i < input.length) {
		let currentChar = input.charAt(i);
		matchLength += 1;
		if (currentChar == '*') {
		    if ((i+1 < input.length) && (input[i+1] == '/')) {
			matchLength += 1;
			break;
		    }
		} else {
		    i += 1;
		}
	    }
	    return matchLength;
	} },
	{"type": "LEX_COMMENT_SINGLE_LINE", "pattern": /^\/\//, "action": function(input, i) {
	    //console.log("action // : input = '" + input + "'");
	    //console.log("action : i = " + i);
	    let matchLength = i;
	    while (i < input.length) {
		let currentChar = input.charAt(i);
		matchLength += 1;
		if (currentChar == '\r' || currentChar == '\n') {
		    break;
		} else {
		    i += 1;
		}
	    }
	    return matchLength;
	} },
	{"type": "LEX_DIVIDE", "pattern": /^\//},
	{"type": "LEX_KEYWORD_AS", "pattern": /^as/i},
	{"type": "LEX_KEYWORD_FROM", "pattern": /^from/i},
	{"type": "LEX_KEYWORD_MATCH", "pattern": /^match/i},
	{"type": "LEX_KEYWORD_GET", "pattern": /^get/i},
	{"type": "LEX_KEYWORD_DELETE", "pattern": /^delete/i},
	{"type": "LEX_KEYWORD_UPDATE", "pattern": /^update/i},
	{"type": "LEX_KEYWORD_AND", "pattern": /^and/i},
	{"type": "LEX_KEYWORD_OR", "pattern": /^or/i},
	{"type": "LEX_KEYWORD_JOIN", "pattern": /^join/i},
	{"type": "LEX_KEYWORD_ON", "pattern": /^on/i},
	{"type": "LEX_KEYWORD_OUTER", "pattern": /^outer/i},
	{"type": "LEX_IDENTIFIER", "pattern": /^[a-zA-Z_]\w*/},
	{"type": "LEX_STRING", "pattern": /^"(\\\\|\\"|[^"])*"/},
	{"type": "LEX_OTHER", "pattern": /^[\s\S]/},
    ];

    this.addRule = function(type, pattern, action) {
        rules.push({
            "type": type,
            "pattern": pattern,
            "action": action,
        });
    };

    this.getRules = function() {
	return rules;
    };

    this.getTokens = function() {
	return tokens;
    };

    this.getToken = function(indexToken) {
	if (indexToken > tokens.length) {
	    return null;
	}
        return tokens[indexToken];
    };

    this._tokenFind = function(input, i) {
	for (var r=0; r < rules.length; r++) {
	    //console.log("_tokenFind() pattern : '" + this.rules[r].pattern + "'");
	    var regex = rules[r].pattern;
	    var result = input.slice(i).match(regex);
            if (result !== null) {
		var matchLength = result[0].length;
		//console.log("_tokenFind() match : '" + rules[r].type + "' len = " + matchLength + " string '" + input.slice(i, i+matchLength) + "'");
		if (Object.hasOwn(rules[r], 'action')) {
		    matchLength = rules[r].action.call(this, input.slice(i), result[0].length);
		}
		//console.log("tokenFind() : matchLength " + matchLength);
		var token = [r, i, matchLength];
		return token;
	    }
	}
    };

    this.tokenize = function(input) {
	//console.log("tokenize() input : '" + input + "'");
        tokens.length = 0;

	for (var i = 0; i < input.length;) {
	    var result = this._tokenFind(input, i);
	    //console.log("tokenize() : matchLength " + result[2]);
	    if (result[2] == 0) {
		break;
	    }
            i += result[2];
	    let token_type = rules[result[0]].type;
	    //console.log("tokenize() : token_type = " + token_type);
	    if (token_type == "LEX_WHITESPACE") continue;
	    if (token_type == "LEX_COMMENT_BLOCK") continue;
	    if (token_type == "LEX_COMMENT_SINGLE_LINE") continue;
            tokens.push(result);
	}

	/***
	for (i=0; i<tokens.length; i++) {
    	    let token = tokens[i];
            var token_text = input.substr(token[1], token[2]);
            console.log("token : ", token_type, token_text);
	}
	***/
    };
}


//----------------------------------------------------------
// BNF-style grammar parser
function BSQL_Parser(lex) {
    let input;
    let colName; //temp holder for multi-part name
    let join_type; //temp variable
    let join_predicate; //temp variable
    let tableName; //temp variable
    let tableName_right; //temp variable
    let tableAlias; //temp variable
    let indexToken = 0;
    const lexer = lex;
    const GRAMMAR = {
	// 1) order rule definitions like PEG, complex -> simple
	// 2) terms without <>s must match lexer's type name
	// 3) optional rules mustwill have an empty string at the end
	// 4) "choose one" rule == ["choice 1", "choice 2", etc.]
	// 5) "match all" rule == "this that other"
	// 6) "terminal" rule == "string_without_spaces"
	'<BSQL>' : {
	    "ruleMatch" : ["<STMT_GET>", "<STMT_DELETE>", "<STMT_UPDATE>", "<STMT_INSERT>"],
	    "afterMatch" : (function(context) {}),
	},
	"<FROM>" : {
	    "ruleMatch" : "LEX_KEYWORD_FROM",
	    "afterMatch" : (function(context) {}),
	},
	"<STMT_GET>" : {
	    "ruleMatch" : "<FROM> <TABLE> <MATCH_CLAUSE_OPTIONAL> <GET> <COL_NAME_LIST>",
	    "afterMatch" : (function(context) {
		//console.log("----- afterMatch() <STMT_GET>");
		context.queryType = contextTypeEnum.GET;
	    }),
	},
	"<GET>" : {
	    "ruleMatch" : "LEX_KEYWORD_GET",
	    "afterMatch" : (function(context) {}),
	},
	"<COL_NAME_LIST>" : {
	    "ruleMatch" : "<COL_NAME> <COL_NAME_MULTIPLE_OPTIONAL>",
	    "afterMatch" : (function(context) {
		//console.log("-- afterMatch() <COL_NAME_LIST>  colName=" + colName);
		//console.log(" -- columns[]", context.columns);
	    }),
	},
	"<COL_NAME_MULTIPLE_OPTIONAL>" : {
	    "ruleMatch" : ["<COL_NAME_MULTIPLE>", ""],
	    "afterMatch" : (function(context) {
		//console.log("-- afterMatch(): <COL_NAME_MULTIPLE_OPTIONAL>");
	    }),
	},	
	"<COL_NAME_MULTIPLE>" : {
	    "ruleMatch" : "<COL_NAME_COMMA> <COL_NAME_LIST>", 
	    "afterMatch" : (function(context) {
		//console.log("-- afterMatch(): <COL_NAME_MULTIPLE> colName=" + colName);
		//console.log(" -- columns[]", context.columns);
	    }),
	},
	"<COL_NAME>" : {
	    "ruleMatch" : ["COL_NAME_STAR", "<DOTTED_IDENTIFIER>", "<COL_NAME_IDENTIFIER>", ""],
	    "afterMatch" : (function(context) {
		if (!colName) { return; }
		//console.log("-- afterMatch(): <COL_NAME> colName=" + colName);
		//console.log(" -- columns[]", context.columns);
		if (!Object.hasOwn(context, "columns")) {
		    context.columns = [];
		}
	    	context.columns.push(colName);
	    }),
	},
	"<COL_NAME_IDENTIFIER>" : {
	    "ruleMatch" : (function () {
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		let rules = lexer.getRules();
		let token_type = rules[lexToken[0]].type;
		//var token_val = input.substr(lexToken[1], lexToken[2]);
		//console.log("rule() <COL_NAME_IDENTIFIER> compare=" + ("LEX_IDENTIFIER" == token_type) + ", val='" + token_val + "'");
		return ("LEX_IDENTIFIER" == token_type);
	    }),
            "afterMatch" : (function(context) {
		let lexToken = lexer.getToken(indexToken);
		colName = input.substr(lexToken[1], lexToken[2]);
		//console.log("-- afterMatch(): <COL_NAME_IDENTIFIER> colName=" + colName);
		//console.log(" -- columns[]", context.columns);
	    }),
	},
	"COL_NAME_STAR" : {
	    "ruleMatch" : "LEX_STAR",
	    "afterMatch" : (function(context) {
		console.log("-- afterMatch(): <COL_NAME_STAR>");
		colName = "*";
	    }),
	},
	"<COL_NAME_COMMA>" : {
	    "ruleMatch" : "LEX_COMMA",
	    "afterMatch" : (function(context) {}),
	},
	"<DOTTED_IDENTIFIER>" : {
	    "ruleMatch" :  (function () {
		//"<IDENTIFIER> <DOT> <IDENTIFIER>",
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		let rules = lexer.getRules();
		let token_type = rules[lexToken[0]].type;
		//console.log("Dotted ID token_type 1 = '" + token_type + "'");
		if ("LEX_IDENTIFIER" != token_type) return false;
		colName = input.substr(lexToken[1], lexToken[2]);
		indexToken += 1;
		//let tokens = lexer.getTokens();
		lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		token_type = rules[lexToken[0]].type;
		//console.log("Dotted ID token_type 2 = '" + token_type + "'");
		if ("LEX_PERIOD" != token_type) return false;
		colName += '.';
		indexToken += 1;
		lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		token_type = rules[lexToken[0]].type;
		//console.log("Dotted ID token_type 3 = '" + token_type + "'");
		if ("LEX_IDENTIFIER" == token_type) {
		    colName += input.substr(lexToken[1], lexToken[2]);
		    return true;
		} else if ("LEX_STAR" == token_type) {
		    colName += "*";
		    return true;
                } else if ("LEX_STAR" == token_type) {
                    colName += "*";
                    return true;
		} else {
		    return false;
		}
	    }),
	    "afterMatch" : (function(context) {
		//console.log("-- afterMatch(): <DOTTED_IDENTIFIER> colName=" + colName);
		//predicateStack.push(colName);
	    }),
	},
	"<IDENTIFIER>" : {
	    "ruleMatch" : (function () {
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		let rules = lexer.getRules();
		var token_val = input.substr(lexToken[1], lexToken[2]);
		let token_type = rules[lexToken[0]].type;
		//console.log("rule(): <IDENTIFIER> compare, val='" + token_val + "'");
		return ("LEX_IDENTIFIER" == token_type);
	    }),
            "afterMatch" : (function(context) {}),
        },
	"<STMT_DELETE>" : {
	    "ruleMatch" : "<FROM> <TABLE_REAL> <MATCH> <DELETE>",
	    "afterMatch" : (function(context) {
		console.log("----- <STMT_DELETE> context func");
		context.queryType = contextTypeEnum.DELETE;
	    }),
	},
	"<DELETE>" : {
	    "ruleMatch" : "LEX_KEYWORD_DELETE",
	    "afterMatch" : (function(context) {}),
	},
	"<STMT_UPDATE>" : {
	    "ruleMatch" : "<FROM> <TABLE_REAL> <MATCH> <UPDATE> <UPDATE_CLAUSE>",
	    "afterMatch" : (function(context) {
		console.log("----- <STMT_UPDATE> context func");
		context.queryType = contextTypeEnum.UPDATE;
	    }),
	},
	"<UPDATE>" : {
	    "ruleMatch" : "LEX_KEYWORD_UPDATE",
	    "afterMatch" : (function(context) {}),
	},
	"<UPDATE_CLAUSE>" : {
	    "ruleMatch" : "<IDENTIFIER_EXPRESSION> <OP_EQUALS> <VALUE_EXPRESSION>",
	    "afterMatch" : (function(context) {}),
	},
	"<STMT_INSERT>" : {
	    "ruleMatch" : "<INSERT> <TABLE_REAL> <INSERT_LIST>",
	    "afterMatch" : (function(context) {
		console.log("----- <STMT_INSERT> context func");
		context.queryType = contextTypeEnum.INSERT;
	    }),
	},
	"<INSERT>" : {
	    "ruleMatch" : "LEX_KEYWORD_INSERT",
	    "afterMatch" : (function(context) {}),
	},
	"<MATCH_CLAUSE_OPTIONAL>" : {
	    "ruleMatch" : ["<MATCH>", ""],
	    "afterMatch" : (function(context) {}),
	},
	"<MATCH>" : {
	    "ruleMatch" : "LEX_KEYWORD_MATCH",
	    "afterMatch" : (function(context) {
		// custom parser for MATCH clause -- { EXPR }
		indexToken += 1;
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) throw "parse MATCH clause: end of tokens";
		let rules = lexer.getRules();
		var token_val = input.substr(lexToken[1], lexToken[2]);
		let token_type = rules[lexToken[0]].type;
		//console.log("parse MATCH clause() token_type = " + token_type);
		if (token_type != "LEX_BRACE_OPEN") {
		    throw "Match Clause: expected '{' got '" + token_val + "'";
		}
		indexToken += 1;
		
		context.match = this.parseMatchBooleanExpression();
		
		lexToken = lexer.getToken(indexToken);
		if (lexToken == null) {
		    context.match = null;
		    throw "parse MATCH clause: syntax error";
		}
		token_type = rules[lexToken[0]].type;
		console.log("parse MATCH clause() token_type 2 = " + token_type);
		if (token_type != "LEX_BRACE_CLOSE") {
		    token_val = input.substr(lexToken[1], lexToken[2]);
		    throw "MATCH clause: expected '}', got '" + token_val + "'";
		}
	    }),
	},
	"<BRACE_OPEN>" : {
	    "ruleMatch" : "LEX_BRACE_OPEN",
	    "afterMatch" : (function(context) {}),
	},
	"<PREDICATE>" : {
	    "ruleMatch" : ["<PREDICATE_COMPARISON>", "<PREDICATE_BETWEEN>", "<PREDICATE_NULL>"],
	    "afterMatch" : (function(context) {}),
	},
	"<BRACE_CLOSE>" : {
	    "ruleMatch" : "LEX_BRACE_CLOSE",
	    "afterMatch" : (function(context) {}),
	},
	"<TABLE>" : {
	    "ruleMatch" : ["<TABLE_JOIN_EXPRESSION>", "<TABLE_REAL>"],
	    "afterMatch" : (function(context) {}),
	},
	"<TABLE_REAL>" : {
	    "ruleMatch" : "<TABLE_NAME> <TABLE_NICKNAME_OPTIONAL>",
	    "afterMatch" : (function(context) {
		//console.log("  -- afterMatch(): <TABLE_REAL> name='" + tableName + "' alias='" + tableAlias + "'");
		let tbl = new AST_Node_Table(tableName, tableAlias);
	    	context.from_table = tbl;
	    }),
	},
	"<TABLE_NAME>" : {
	    "ruleMatch" : (function () {
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		let rules = lexer.getRules();
		tableName = input.substr(lexToken[1], lexToken[2]);
		tableAlias = null; // clear it now, might be set later
		let token_type = rules[lexToken[0]].type;
		//console.log("  --rule(): <TABLE_NAME> compare, name='" + tableName + "'");
		return ("LEX_IDENTIFIER" == token_type);
	    }),
            "afterMatch" : (function(context) {}),
        },
	"<TABLE_NAME_RIGHT>" : {
	    "ruleMatch" : (function () {
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		let rules = lexer.getRules();
		tableName_right = input.substr(lexToken[1], lexToken[2]);
		let token_type = rules[lexToken[0]].type;
		//console.log("  --ruleMatch(): <TABLE_NAME_RIGHT> name='" + tableName_right + "'");
		return ("LEX_IDENTIFIER" == token_type);
	    }),
            "afterMatch" : (function(context) {}),
        },
	"<TABLE_JOIN_EXPRESSION>" : {
	    "ruleMatch" : "<TABLE_JOIN_RESET> <BRACE_OPEN> <TABLE_NAME> <TABLE_JOIN_OPTIONAL> <TABLE_NICKNAME>",
	    "afterMatch" : (function(context) {
		console.log("-- afterMatch() <TABLE_JOIN_EXPRESSION>  tableName=" + tableName);
		if (tableName_right != null) {
		    let join = new AST_Node_Join(tableName, tableName_right, tableAlias, join_type);
		    join.join_predicate = join_predicate;
	    	    context.from_table = join;
		} else {
		    let tbl = new AST_Node_Table(tableName, tableAlias);
	    	    context.from_table = tbl;
		}
	    }),
	},
	"<TABLE_JOIN_OPTIONAL>" : {
	    "ruleMatch" : ["<TABLE_JOIN_RIGHT>", ""],
	    "afterMatch" : (function(context) {
		console.log("-- afterMatch(): <TABLE_JOIN_OPTIONAL>");
	    }),
	},	
	"<TABLE_JOIN_RESET>" : {
	    "ruleMatch" : (function () {
		// FAKE RULE to ensure that global temp variables are re-set
		tableName_right = null;
		tableAlias = null;
		join_type = null;
		join_predicate = null;
		indexToken--; // back up grammar state machine
		return true; // fake match
	    }),
            "afterMatch" : (function(context) {}),
	},
	"<TABLE_JOIN_RIGHT>" : {
	    "ruleMatch" : "<JOIN_TYPE> <TABLE_NAME_RIGHT> <TABLE_JOIN_ON_OPTIONAL>",
	    "afterMatch" : (function(context) {
		console.log("-- afterMatch(): <TABLE_JOIN_RIGHT>");
	    }),
	},
	"<JOIN_TYPE>" : {
	    "ruleMatch" : ["<OP_JOIN>", "<OP_OUTER_JOIN>"],
	    "afterMatch" : (function(context) {}),
	},
	"<OP_JOIN>" : {
	    "ruleMatch" : "LEX_KEYWORD_JOIN",
	    "afterMatch" : (function(context) {
		join_type = joinTypeEnum.INNER_JOIN;
	    }),
	},
	"<OP_OUTER_JOIN>" : {
	    "ruleMatch" : (function () {
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		let rules = lexer.getRules();
		let token_type = rules[lexToken[0]].type;
		console.log("OUTER JOIN token_type 1 = '" + token_type + "'");
		if ("LEX_KEYWORD_OUTER" != token_type) return false;
		indexToken += 1;
		let tokens = lexer.getTokens();
		while (indexToken < tokens.length) {
		    let token = tokens[indexToken];
		    let token_type = rules[token[0]].type;
		    console.log("OUTER JOIN skip token_type = '" + token_type + "'");
		    if (token_type == "LEX_WHITESPACE") {
			indexToken += 1;
		    } else if (token_type == "LEX_COMMENT_BLOCK") {
			indexToken += 1;
		    } else if (token_type == "LEX_COMMENT_SINGLE_LINE") {
			indexToken += 1;
		    } else {
			break;
		    }
		}
		lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		token_type = rules[lexToken[0]].type;
		console.log("OUTER JOIN token_type 2 = '" + token_type + "'");
		if ("LEX_KEYWORD_JOIN" != token_type) return false;
		join_type = joinTypeEnum.OUTER_JOIN;
		//joinTypeEnum.LEFT_OUTER_JOIN
		//joinTypeEnum.RIGHT_OUTER_JOIN
		return true;
	    }),
	    "afterMatch" : (function(context) {}),
	},
	"<TABLE_JOIN_ON_OPTIONAL>" : {
	    "ruleMatch" : ["<TABLE_JOIN_ON>", ""],
	    "afterMatch" : (function(context) {}),
	},
	"<TABLE_JOIN_ON>" : {
	    "ruleMatch" : "LEX_KEYWORD_ON",
	    "afterMatch" : (function(context) {
		console.log("-- afterMatch(): <TABLE_JOIN_ON>");
		join_predicate = this.parseJoinPredicate();
	    }),
	},
	"<TABLE_NICKNAME_OPTIONAL>" : {
	    "ruleMatch" : ["<TABLE_NICKNAME>", ""],
	    "afterMatch" : (function(context) {}),
	},
	"<TABLE_NICKNAME>" : {
	    "ruleMatch" : "<AS> <TABLE_NICKNAME_IDENTIFIER>",
	    "afterMatch" : (function(context) {}),
	},
	"<AS>" : {
	    "ruleMatch" : (function () {
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		let rules = lexer.getRules();
		let token_type = rules[lexToken[0]].type;
		return ("LEX_KEYWORD_AS" == token_type);
	    }),
	    "afterMatch" : (function(context) {}),
	},
	"<TABLE_NICKNAME_IDENTIFIER>" : {
	    "ruleMatch" : (function () {
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		let rules = lexer.getRules();
		tableAlias = input.substr(lexToken[1], lexToken[2]);
		let token_type = rules[lexToken[0]].type;
		console.log("rule() <TABLE_NICKNAME_IDENTIFIER> compare=" + ("LEX_IDENTIFIER" == token_type) + ", tableAlias='" + tableAlias + "'");
		return ("LEX_IDENTIFIER" == token_type);
	    }),
            "afterMatch" : (function(context) {
		//console.log("-- afterMatch(): <TABLE_NICKNAME_IDENTIFIER> colName=" + colName);
	    }),
	},
	"" : {
	    "ruleMatch" : (function() {
		//console.log('TERMINAL: ""');
		indexToken -= 1; // backtrack hack to cover "fake match"
		return true;
	    }),
	    "afterMatch" : (function(context) {}),
	},
    };

    this.parse = function(str) {
	input = str;
	lexer.tokenize(str);
	let context = new QueryContext();
	//this.skipWhiteSpaces();
	if (!this.matchGrammar("<BSQL>", context)) {
	    console.log("parse() SYNTAX ERROR - no pattern matched");
	    return null;
	}
	let tokens = lexer.getTokens();
	if (indexToken < tokens.length) {
	    console.log("parse() SYNTAX ERROR - extra tokens : (len > index)" + tokens.length + " > "  + indexToken);
	}
	return context;
    };

    // parse logical tree of predicates
    this.parseMatchBooleanExpression = function() {
	// <boolean expression> ::=
        //    <boolean term>  |  <boolean expression> OR <boolean term>
	console.log("parseMatchBooleanExpression() indexToken = " + indexToken);
	let term = this.parseMatchBooleanTerm();
	console.log("parseMatchBooleanExpression() term 1 = " + term.toString());
	let lexToken = lexer.getToken(indexToken);
	let rules = lexer.getRules();
	let token_type = rules[lexToken[0]].type;
	if (token_type == "LEX_KEYWORD_OR") {
	    console.log("parseMatchBooleanExpression() (AND) token_type = " + token_type);
	    indexToken += 1;
	    let node = new AST_Node_Binary();
	    node.left = term;
	    node.op = token_type;
	    node.right = this.parseMatchBooleanTerm();
	    console.log("parseMatchBooleanExpression() right = " + node.right.toString());
	    return node;
	} else {
	    return term;
	}
    }
    
    this.parseMatchBooleanTerm = function() {
	// <boolean term> ::=
	//    <boolean factor>  |  <boolean term> AND <boolean factor>
	console.log("parseMatchBooleanTerm() indexToken = " + indexToken);
	let factor = this.parseMatchBooleanFactor();
	console.log("parseMatchBooleanTerm() factor 1 = " + factor.toString());
	let lexToken = lexer.getToken(indexToken);
	let rules = lexer.getRules();
	let token_type = rules[lexToken[0]].type;
	if (token_type == "LEX_KEYWORD_AND") {
	    console.log("parseMatchBooleanTerm() (AND) token_type = " + token_type);
	    indexToken += 1;
	    let node = new AST_Node_Binary();
	    node.left = factor;
	    node.op = token_type;
	    node.right = this.parseMatchBooleanFactor();
	    console.log("parseMatchBooleanTerm() right = " + node.right.toString());
	    return node;
	} else {
	    return factor;
	}
    }
    
    this.parseMatchBooleanFactor = function() {
	// <boolean factor> ::= [ NOT ] <boolean test>
	console.log("parseMatchBooleanfactor() indexToken = " + indexToken);
	let exp = this.parseMatchExpression();
	
	let lexToken = lexer.getToken(indexToken);
	if (lexToken == null) throw "parseMatchBooleanFactor: end of tokens";
	let rules = lexer.getRules();
	var token_val = input.substr(lexToken[1], lexToken[2]);
	let token_type = rules[lexToken[0]].type;
	console.log("parseMatchBooleanFactor() token_type = '" + token_type + "'");
	if ( (token_type == "LEX_EQUAL")
	     || (token_type == "LEX_NOT_EQUAL")
	     || (token_type == "LEX_GREATER")
	     || (token_type == "LEX_LESS") ) {
	    console.log("parseMatchBooleanFactor() = token_type = '" + token_type + "'");
	    indexToken += 1;
	    let node = new AST_Node_Binary();
	    node.left = exp;
	    node.op = token_type;
	    node.right = this.parseMatchExpression();
	    console.log("parseMatchBooleanFactor() right = " + node.right.toString());
	    return node;
	} else {
	    return exp;
	}
    }
    
    this.parseMatchExpression = function() {
	console.log("parseMatchExpression() indexToken = " + indexToken);
	let lexToken = lexer.getToken(indexToken);
	if (lexToken == null) throw "parseMatchExpression: end of tokens";
	let rules = lexer.getRules();
	var token_val = input.substr(lexToken[1], lexToken[2]);
	let token_type = rules[lexToken[0]].type;
	console.log("parseMatchExpression() token_type = '" + token_type + "'");
	let term = this.parseMatchTerm();
	if ( (token_type == "LEX_PLUS")
	     || (token_type == "LEX_MINUS") ) {
	    console.log("parseMatchExpression() +- token_type = '" + token_type + "'");
	    indexToken += 1;
	    let node = new AST_Node_Binary();
	    node.left = term;
	    node.op = token_type;
	    node.right = this.parseMatchTerm();
	    return node;
	} else {
	    return term;
	}
    }

    this.parseMatchTerm = function() {
	console.log("parseMatchTerm() indexToken = " + indexToken);
	let lexToken = lexer.getToken(indexToken);
	if (lexToken == null) throw "parseMatchTerm: end of tokens";
	let rules = lexer.getRules();
	var token_val = input.substr(lexToken[1], lexToken[2]);
	let token_type = rules[lexToken[0]].type;
	console.log("parseMatchTerm() token_type = " + token_type);
	let factor = this.parseMatchFactor();
	console.log("parseMatchTerm() factor 1 = " + factor.toString());
	lexToken = lexer.getToken(indexToken);
	token_type = rules[lexToken[0]].type;
	if ( (token_type == "LEX_STAR")
	     || (token_type == "LEX_DIVIDE") ) {
	    console.log("parseMatchTerm() */ token_type = " + token_type);
	    indexToken += 1;
	    let node = new AST_Node_Binary();
	    node.left = factor;
	    node.op = token_type;
	    node.right = this.parseMatchFactor();
	    console.log("parseMatchTerm() factor 2 = " + node.right.toString());
	    return node;
	} else {
	    return factor;
	}
    }

    this.parseMatchFactor = function() {
	console.log("parseMatchFactor() indexToken = " + indexToken);
	let lexToken = lexer.getToken(indexToken);
	if (lexToken == null) throw "parseMatchFactor: end of tokens";
	let rules = lexer.getRules();
	var token_val = input.substr(lexToken[1], lexToken[2]);
	let token_type = rules[lexToken[0]].type;
	console.log("parseMatchFactor() token_type = " + token_type);
	let primary;
	switch (token_type) {
	    // paren
	case "LEX_BRACE_CLOSE":
	    return;
	case "LEX_NUM_FLOAT":
	case "LEX_NUM_INT":
	case "LEX_STRING":
	    console.log("parseMatchFactor() VALUE");
	    indexToken += 1;
	    primary = new AST_Node_Primary();
	    primary.type = token_type;
	    primary.value = token_val;
	    return primary;
	case "LEX_IDENTIFIER":
	    console.log("parseMatchFactor() ID");
	    let id = token_val;
	    indexToken += 1;
	    lexToken = lexer.getToken(indexToken);
	    if (lexToken) {
		token_type = rules[lexToken[0]].type;
		if (token_type == "LEX_PERIOD") {
		    // dotted identifier
		    indexToken += 1;
		    lexToken = lexer.getToken(indexToken);
		    if (lexToken) {
			token_type = rules[lexToken[0]].type;
			if (lexToken && (token_type == "LEX_IDENTIFIER")) {
			    indexToken += 1;
			    id += "." + input.substr(lexToken[1], lexToken[2]);
			    console.log("parseMatchFactor() dotted ID = " + id);
			}
		    }
		}
	    }
	    primary = new AST_Node_Primary();
	    primary.type = "LEX_IDENTIFIER";
	    primary.value = id;
	    return primary;
	default:
	    console.log("parseMatchFactor: got val='" + token_val + "'");
	    return;
	}
    }
    

    this.parseJoinPredicate = function() {
	// <predicate> ::= <boolean test>
	indexToken += 1;
	console.log("parseJoinPredicate() indexToken = " + indexToken);
	let exp = this.parseJoinPredicateExpression();
	
	let lexToken = lexer.getToken(indexToken);
	if (lexToken == null) throw "parseJoinPredicate: end of tokens";
	let rules = lexer.getRules();
	var token_val = input.substr(lexToken[1], lexToken[2]);
	let token_type = rules[lexToken[0]].type;
	console.log("parseJoinPredicate() token_type = '" + token_type + "'");
	if (token_type == "LEX_EQUAL") {
	    console.log("parseJoinPredicate() = token_type = '" + token_type + "'");
	    indexToken += 1;
	    let node = new AST_Node_Binary();
	    node.left = exp;
	    node.op = token_type;
	    node.right = this.parseJoinPredicateExpression();
	    console.log("parseJoinPredicate() right = " + node.right.toString());
	    return node;
	} else {
	    throw "parseMatchJoinPredicate: syntax error";
	}
    }
    
    this.parseJoinPredicateExpression = function() {
	console.log("parseJoinPredicateExpression() indexToken = " + indexToken);
	let lexToken = lexer.getToken(indexToken);
	if (lexToken == null) throw "parseJoinPredicateExpression: end of tokens";
	let rules = lexer.getRules();
	var token_val = input.substr(lexToken[1], lexToken[2]);
	let token_type = rules[lexToken[0]].type;
	console.log("parseJoinPredicateExpression() token_type = '" + token_type + "'");
	let term = this.parseJoinPredicateTerm();
	if ( (token_type == "LEX_PLUS")
	     || (token_type == "LEX_MINUS") ) {
	    console.log("parseJoinPredicateExpression() +- token_type = '" + token_type + "'");
	    indexToken += 1;
	    let node = new AST_Node_Binary();
	    node.left = term;
	    node.op = token_type;
	    node.right = this.parseJoinPredicateTerm();
	    return node;
	} else {
	    return term;
	}
    }

    this.parseJoinPredicateTerm = function() {
	console.log("parseJoinPredicateTerm() indexToken = " + indexToken);
	let lexToken = lexer.getToken(indexToken);
	if (lexToken == null) throw "parseJoinPredicateTerm: end of tokens";
	let rules = lexer.getRules();
	var token_val = input.substr(lexToken[1], lexToken[2]);
	let token_type = rules[lexToken[0]].type;
	console.log("parseJoinPredicateTerm() token_type = " + token_type);
	let factor = this.parseJoinPredicateFactor();
	if (!factor) {
	    throw "parseJoinPredicateTerm() syntax error";
	}
	console.log("parseJoinPredicateTerm() factor 1 = " + factor.toString());
	
	lexToken = lexer.getToken(indexToken);
	token_type = rules[lexToken[0]].type;
	if ( (token_type == "LEX_STAR")
	     || (token_type == "LEX_DIVIDE") ) {
	    console.log("parseJoinPredicateTerm() */ token_type = " + token_type);
	    indexToken += 1;
	    let node = new AST_Node_Binary();
	    node.left = factor;
	    node.op = token_type;
	    node.right = this.parseJoinPredicateFactor();
	    console.log("parseJoinPredicateTerm() factor 2 = " + node.right.toString());
	    return node;
	} else {
	    return factor;
	}
    }

    this.parseJoinPredicateFactor = function() {
	console.log("parseJoinPredicateFactor() indexToken = " + indexToken);
	let lexToken = lexer.getToken(indexToken);
	if (lexToken == null) throw "parseJoinPredicateFactor: end of tokens";
	let rules = lexer.getRules();
	var token_val = input.substr(lexToken[1], lexToken[2]);
	let token_type = rules[lexToken[0]].type;
	console.log("parseJoinPredicateFactor() token_type = " + token_type);
	let primary;
	switch (token_type) {
	    // paren
	case "LEX_BRACE_CLOSE":
	    return;
	case "LEX_NUM_FLOAT":
	case "LEX_NUM_INT":
	case "LEX_STRING":
	    console.log("parseJoinPredicateFactor() VALUE");
	    indexToken += 1;
	    primary = new AST_Node_Primary();
	    primary.type = token_type;
	    primary.value = token_val;
	    return primary;
	case "LEX_IDENTIFIER":
	    console.log("parseJoinPredicateFactor() ID");
	    let id = token_val;
	    indexToken += 1;
	    lexToken = lexer.getToken(indexToken);
	    if (lexToken) {
		token_type = rules[lexToken[0]].type;
		if (token_type == "LEX_PERIOD") {
		    // dotted identifier
		    indexToken += 1;
		    lexToken = lexer.getToken(indexToken);
		    if (lexToken) {
			token_type = rules[lexToken[0]].type;
			if (lexToken && (token_type == "LEX_IDENTIFIER")) {
			    indexToken += 1;
			    id += "." + input.substr(lexToken[1], lexToken[2]);
			    console.log("parseJoinPredicateFactor() dotted ID = " + id);
			}
		    }
		}
	    }
	    primary = new AST_Node_Primary();
	    primary.type = "LEX_IDENTIFIER";
	    primary.value = id;
	    return primary;
	default:
	    console.log("parseJoinPredicateFactor: got val='" + token_val + "'");
	    return;
	}
    }


    // parse-tree builder with backtracking
    this.matchGrammar = function(gramPattern, context) {
	//this.skipWhiteSpaces();
	if (GRAMMAR[gramPattern] == undefined) {
	    throw("Internal error -- check grammar rule '" + gramPattern + "'");
	}
	//console.log("matchGrammar() pat '" + gramPattern + "' : rule= '" + GRAMMAR[gramPattern].ruleMatch + "'");
	let grammarRule = GRAMMAR[gramPattern].ruleMatch;
	if (grammarRule instanceof Array) {   // if (typeof grammarRule === "object") {
	     // handle "ONE OF" grammar rule
	    let oldIndex = indexToken;
	    let idxRule = 0;
	    while (idxRule < grammarRule.length) {
		indexToken = oldIndex;  // reset for loop
		console.log("matchGrammar() ARRAY pat='" + gramPattern + "' : TRYING : '" + grammarRule[idxRule] + "'");

		// if any subrule succeeds, finish the rule
		if (this.matchGrammar(grammarRule[idxRule], context)) {
		    //console.log("matchGrammar() " + gramPattern + " : FOUND ARRAY MATCH");
		    GRAMMAR[gramPattern].afterMatch.call(this, context);
		    return true;
		}
		idxRule++;
	    }
	    // tried all options
	    //console.log("matchGrammar() " + gramPattern + " : NO ARRAY MATCH");
	    return false;
	} else 	if (typeof grammarRule === "string") {
	    // handle TERMINAL and SEQUENCE grammar rules
	    if (grammarRule.indexOf(' ') < 0) {
		// TERMINAL (single right-side pattern)
		let lexToken = lexer.getToken(indexToken);
		if (lexToken == null) return false;
		let lexRules = lexer.getRules();
		var token_type = lexRules[lexToken[0]].type;
		if (GRAMMAR[gramPattern].ruleMatch != token_type) {
		    console.log("matchGrammar() TERMINAL MISMATCH : pattern " + gramPattern + ", got " + token_type);
		    return false;
		} else {
		    console.log("matchGrammar() TERMINAL MATCH : wanted : " + GRAMMAR[gramPattern].ruleMatch + " got : " + token_type);
		    GRAMMAR[gramPattern].afterMatch.call(this, context);
		    return true;
		}
	    }
	    // MULTI-WORD SEQUENCE
	    let oldIndex = indexToken;
	    let subRules = grammarRule.split(' ');
	    let idxRule = 0;
	    while (idxRule < subRules.length) {
		console.log("matchGrammar() SEQ  pat : '" + gramPattern + "' subRule : '" + subRules[idxRule] + "'");

		if (idxRule > 0) {
		    indexToken += 1;
		    //this.skipWhiteSpaces();
		}
		let tokens = lexer.getTokens();
		/***
		if (indexToken >= tokens.length) {
		    console.log("matchGrammar() SEQ - no more tokens");
		    return false;
		}
		***/
		if (this.matchGrammar(subRules[idxRule], context)) {
		    console.log("matchGrammar() SEQ MATCH, pat : " + subRules[idxRule]);
		    idxRule++;
		} else {
		    if (indexToken >= tokens.length) {
			console.log("matchGrammar() SEQ MISMATCH - no more tokens");
			return false;
		    }
		    let lexToken = lexer.getToken(indexToken);
		    let rules = lexer.getRules();
		    let token_type = rules[lexToken[0]].type;
		    //console.log("matchGrammar() SEQ MISMATCH, wanted '" + subRules[idxRule] + "' got '" + token_type + "'");
		    indexToken = oldIndex;
		    return false;
		}
	    }
	    // matched all subRules in rule, set context
	    GRAMMAR[gramPattern].afterMatch.call(this, context);
	    return true;
	} else if (typeof grammarRule === "function") {
	    if (grammarRule.call()) {
		GRAMMAR[gramPattern].afterMatch.call(this, context);
		return true;
	    }
	    return false;
	} else {
	    console.log("matchGrammar() INTERNAL ERROR at " + gramPattern);
	    return false;
	}

    return false;
    };
}
