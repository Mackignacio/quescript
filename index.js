"use strict";

function $$(el, options = {}) {
  let QS;
  const QS_FUN_BUILDER = (body, context = QS) => new Function(`return ${body};`).bind(context);
  const CONSTANTS = ["$$click", "$$if"];
  const EVENTS = ["$$VALUE_CHANGE"];
  const AST_TOKEN_TYPE = ["Function", "Logical Operator", "Comparison Operator", "String", "Number"];
  const REGEX_PATTERN = {
    STR_INTERP: /{{(\w+)}}/g,
    FUNC_NAME: /^([a-zA-Z]*?[0-9]*?)\((.*?)\);?$/g,
    LOG_OP: /^(\&\&)|(\|\|)|\!$/g,
    COM_OP: /^([!|=]={1,2})|([<|>]=?)$/g,
    VAR_STR: /^\'.*?\'$/g,
    VAR_NUM: /^[0-9]+$/g,
  };

  class QueryScript {
    static createData(data) {
      return new Proxy(data, {
        set: function (target, prop, value) {
          target[prop] = value;
          document.dispatchEvent(new CustomEvent(EVENTS[0], { detail: { target, prop, value } }));
          return target[prop];
        },
      });
    }

    constructor(element, { data = {}, methods = {} } = {}) {
      this.element = element;
      this.mapDataKeys(data);
      this.mapDataKeys(methods);
    }

    onLoad() {
      this.mapElement(document.querySelector(this.element));
    }

    onEvent(target) {
      if (target.match(REGEX_PATTERN.FUNC_NAME)) {
        const func = this.functionExprBuilder(value);
        this[func.name](...func.value);
      }
    }

    functionExprBuilder(value) {
      const func = { name: "", args: [], value: "" };
      const mapArgs = (isTextvalue) => (arg) => {
        const IS_NUMBER = arg.match(REGEX_PATTERN.VAR_NUM);
        const IS_TEXT = (arg.includes("'") && arg.includes('"')) || arg == "";

        if (!isTextvalue) {
          return IS_NUMBER ? Number(arg) : IS_TEXT ? arg : `this.${arg}`;
        }

        return IS_NUMBER ? Number(arg) : IS_TEXT ? this[arg] : arg.replace(/'|"/g, "");
      };

      for (const match of value.matchAll(REGEX_PATTERN.FUNC_NAME)) {
        func.name = match[1];
        func.args = match[2].split(",").map(mapArgs());
      }

      func.value = func.args !== "" && func.args !== undefined ? func.args.map(mapArgs(true)) : [];
      return func;
    }

    parseExpr(text) {
      const { FUNC_NAME, LOG_OP, COM_OP, VAR_STR, VAR_NUM } = REGEX_PATTERN;
      // check if value is a function
      if (text.match(FUNC_NAME)) {
        const { name, value } = this.functionExprBuilder(text);
        return { type: AST_TOKEN_TYPE[0], name: `this.${name}`, args: value };
      }
      // check if value is an operator
      if (text.match(LOG_OP) || text.match(COM_OP)) {
        return { type: text.match(LOG_OP) ? AST_TOKEN_TYPE[1] : AST_TOKEN_TYPE[2], value: text };
      }
      // check if value is a string
      if (text.match(VAR_STR)) {
        return { type: AST_TOKEN_TYPE[3], value: text.replace(/'|"/g, "") };
      }
      // check if value is a number
      if (text.match(VAR_NUM)) {
        return { type: AST_TOKEN_TYPE[4], value: Number(text) };
      }
    }

    createAST(target, expr = []) {
      for (let piece of target.split(" ")) {
        const falsy = "!" === piece[0];
        const value = falsy ? piece.slice(1, piece.length) : piece;
        const obj = value.match(/^\w+?$/g) ? { type: "Variable", value: `this.${value}` } : this.parseExpr(value);
        expr.push(value.match(REGEX_PATTERN.FUNC_NAME) ? { ...obj, falsy } : obj);
      }

      return expr;
    }

    buildAST(ast) {
      let expr = "";
      for (const token of ast) {
        const { type, name = "", value = "", args = [], falsy = false } = token;
        if (type === AST_TOKEN_TYPE[0]) {
          expr += `${falsy ? "!" : ""}${name}(${args.join()})`;
        }
      }

      return QS_FUN_BUILDER(expr);
    }

    mapElement(element) {
      for (const child of element.children) {
        if (child.hasAttribute(CONSTANTS[1])) this.mapDirectives(element, child);
        if (child.innerText.match(REGEX_PATTERN.STR_INTERP)) this.mapStringInterpolation(child);
      }
    }

    mapDirectives(parent, child) {
      let directive = () => {};

      if (child.getAttribute(CONSTANTS[1])) {
        directive = () => {
          const ast = this.createAST(child.getAttribute(CONSTANTS[1]));
          const expr = this.buildAST(ast);
        };
      }

      directive();

      //   LISTENS FOR CHANGES
      document.addEventListener(EVENTS[0], () => directive());
    }

    mapStringInterpolation(child) {
      let text = child.innerText;
      const textMatches = text.matchAll(REGEX_PATTERN.STR_INTERP);
      const textNode = document.createTextNode("");
      child.innerText = "";
      child.appendChild(textNode);

      for (const match of textMatches) text = text.replace(new RegExp(`{{${match[1]}}}`, "g"), `$\{this.${match[1]}}`);
      const updateTextNode = () => (textNode.nodeValue = QS_FUN_BUILDER(`\`${text}\``)());
      updateTextNode();

      //   LISTENS FOR CHANGES
      document.addEventListener(EVENTS[0], updateTextNode);
    }

    mapDataKeys(data) {
      Object.keys(data).map((key) => {
        //   LISTENS FOR CHANGES
        this[key] = data[key];
        document.addEventListener(EVENTS[0], (event) => {
          if (event.detail.prop === key && this[key] !== event.detail.value) this[key] = event.detail.value;
        });
      });
    }
  }

  if (el) {
    QS = QueryScript.createData(new QueryScript(el, options));
    document.addEventListener("DOMContentLoaded", () => QS.onLoad());
    document.addEventListener("click", (e) => {
      if (e.target.hasAttribute(CONSTANTS[0])) QS.onEvent(e.target.getAttribute(CONSTANTS[0]));
    });
  }

  return QueryScript;
}
