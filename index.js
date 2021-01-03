"use strict";

function $$(el, options = {}) {
  let QS;
  const QS_FUN_BUILDER = (body, context = QS) => new Function(`return ${body};`).bind(context);
  const CONSTANTS = ["$$click", "$$if"];
  const QS_EVENTS = ["$$VALUE_CHANGE"];
  const AST_TOKEN_TYPE = ["Function", "Logical Operator", "Comparison Operator", "String", "Number", "Variable"];
  const REGEX_PATTERN = {
    STR_INTERP: /{{(\w+)}}/g,
    EXPR: /([a-zA-Z]+?[0-9]*?\(.*?\))|(\&\&)|(\|\|)|(\!)|([!|=]={1,2})|([<|>]=?)|(\'.*?\')|(\w+)|([0-9]+)/g,
    FUNC_NAME: /^([a-zA-Z]*?[0-9]*?)\((.*?)\);?$/g,
    LOG_OP: /^(\&\&)|(\|\|)|\!$/g,
    COM_OP: /^([!|=]={1,2})|([<|>]=?)$/g,
    VAR_STR: /^\'.*?\'$/g,
    VAR_NUM: /^[0-9]+$/g,
    INNER_HTML: /^.*?\n\s*(\w*?)\s/g,
  };

  class QueryScript {
    static createData(data) {
      return new Proxy(data, {
        set: function (target, prop, value) {
          if (target[prop] !== value) {
            target[prop] = value;
            document.dispatchEvent(new CustomEvent(QS_EVENTS[0], { detail: { target, prop, value } }));
          }
          return target[prop];
        },
      });
    }

    constructor(element, { data = {}, methods = {} } = {}) {
      this.element = element;
      this.mapDataKeys(data);
      this.mapDataKeys(methods);
    }

    mount() {
      const component = this.mapElement(document.querySelector(this.element));
      this.componentResolver(component.children);
    }

    componentResolver(component, prev, next) {
      if (Array.isArray(component)) {
        let prev, next;

        for (let i = 0; i < component.length; i++) {
          next = component[i + 1];
          this.componentResolver(component[i], prev, next);
          prev = component[i];
        }
        return;
      }

      const ELEMENT_BUILDER = this.elementBuilder(component, prev, next);

      ELEMENT_BUILDER();
      document.addEventListener(QS_EVENTS[0], ELEMENT_BUILDER);

      if (component.children.length > 0) return this.componentResolver(component.children);
    }

    elementBuilder(component, prev, next) {
      return () => {
        let SHOWABLE = true;

        for (const directive of component.directives) {
          if (SHOWABLE && !directive()) {
            SHOWABLE = directive();
            continue;
          }
        }

        if (!SHOWABLE) return component.el.remove();
        if (typeof component.createText == "function") component.createText();
        if (!prev) return component.parent.prepend(component.el);
        if (!next) return component.parent.append(component.el);
        if (prev && next) return component.parent.insertBefore(component.el, next.el);
      };
    }

    onEvent(target) {
      if (target.match(REGEX_PATTERN.FUNC_NAME)) {
        const func = this.functionExprBuilder(target);
        this[func.name](...func.value);
      }
    }

    functionExprBuilder(value) {
      const func = { name: "", args: [], value: "" };
      const mapArgs = (isTextvalue) => (arg) => {
        const IS_NUMBER = arg.match(REGEX_PATTERN.VAR_NUM);
        const IS_TEXT = arg.match(REGEX_PATTERN.VAR_STR);

        if (!isTextvalue) {
          return IS_NUMBER ? Number(arg) : IS_TEXT || arg === "" ? arg : `this.${arg}`;
        }

        return IS_NUMBER ? Number(arg) : IS_TEXT ? arg.replace(/'|"/g, "") : this[arg];
      };

      for (const match of value.matchAll(REGEX_PATTERN.FUNC_NAME)) {
        func.name = match[1];
        func.args = match[2].split(",").map(mapArgs());
      }

      func.value = func.args.length > 0 ? func.args.map(mapArgs(true)) : [];
      return func;
    }

    parseExpr(text) {
      const { FUNC_NAME, LOG_OP, COM_OP, VAR_STR, VAR_NUM } = REGEX_PATTERN;
      // check if value is a function
      if (text.match(FUNC_NAME)) {
        const { name, args } = this.functionExprBuilder(text);
        return { type: AST_TOKEN_TYPE[0], name: `this.${name}`, args };
      }
      // check if value is an operator
      if (text.match(LOG_OP) || text.match(COM_OP)) {
        return { type: text.match(LOG_OP) ? AST_TOKEN_TYPE[1] : AST_TOKEN_TYPE[2], value: text };
      }
      // check if value is a string
      if (text.match(VAR_STR)) {
        return { type: AST_TOKEN_TYPE[3], value: text };
      }
      // check if value is a number
      if (text.match(VAR_NUM)) {
        return { type: AST_TOKEN_TYPE[4], value: Number(text) };
      }
    }

    createAST(target, expr = []) {
      for (let match of target.matchAll(REGEX_PATTERN.EXPR)) {
        const piece = match[0];
        const falsy = "!" === piece[0];
        const value = falsy ? piece.slice(1, piece.length) : piece;
        const obj = value.match(/^\w+?$/g) ? { type: AST_TOKEN_TYPE[5], value: `this.${value}` } : this.parseExpr(value);
        expr.push(value.match(REGEX_PATTERN.FUNC_NAME) ? { ...obj, falsy } : obj);
      }

      return expr;
    }

    buildAST(ast) {
      let expr = "";
      for (const token of ast) {
        const { type, name = "", value = "", args = [], falsy = false } = token;
        expr += type === AST_TOKEN_TYPE[0] ? `${falsy ? "!" : ""}${name}(${args.join()})` : ` ${value}`;
      }

      return QS_FUN_BUILDER(expr);
    }

    mapElement(el, parent) {
      const text = el.innerHTML.includes("\n") ? [...el.innerHTML.matchAll(REGEX_PATTERN.INNER_HTML)][0][1] : el.textContent;
      const attr = (str) => el.getAttribute(str);
      const component = {
        tag: el.tagName,
        id: attr("id"),
        src: attr("src"),
        class: attr("class"),
        value: attr("value"),
        href: attr("href"),
        children: [],
        directives: [],
        text,
        el,
        parent,
      };

      if (el.children.length > 0) {
        for (const child of el.children) {
          component.children.push(this.mapElement(child, el));
        }

        return component;
      }

      if (component.text.match(REGEX_PATTERN.STR_INTERP)) {
        component.textNode = document.createTextNode(component.text);
        component.createText = this.mapStringInterpolation(component.text, component.textNode);
        component.el.textContent = "";
        component.el.appendChild(component.textNode);
      }

      if (component.el.hasAttribute(CONSTANTS[0])) {
        const eventMethodName = component.el.getAttribute(CONSTANTS[0]);
        component.el.addEventListener("click", () => {
          const { name, value } = this.functionExprBuilder(eventMethodName);
          this[name](...value);
        });
        component.el.removeAttribute(CONSTANTS[0]);
      }

      if (component.el.hasAttribute(CONSTANTS[1])) {
        component.directives.push(this.mapDirectives(el));
        component.el.removeAttribute(CONSTANTS[1]);
      }

      return component;
    }

    mapDirectives(child) {
      if (child.getAttribute(CONSTANTS[1])) {
        const ast = this.createAST(child.getAttribute(CONSTANTS[1])); // Create AST tokens
        return this.buildAST(ast); // Build and Execute expression from AST
      }
    }

    mapStringInterpolation(text, textNode) {
      const textMatches = text.matchAll(REGEX_PATTERN.STR_INTERP);
      for (const match of textMatches) text = text.replace(new RegExp(`{{${match[1]}}}`, "g"), `$\{this.${match[1]}}`);
      return () => (textNode.nodeValue = QS_FUN_BUILDER(`\`${text}\``)());
    }

    mapDataKeys(data) {
      Object.keys(data).map((key) => {
        //   LISTENS FOR CHANGES
        this[key] = data[key];
        document.addEventListener(QS_EVENTS[0], (event) => {
          if (event.detail.prop === key && this[key] !== event.detail.value) this[key] = event.detail.value;
        });
      });
    }
  }

  if (el) {
    QS = QueryScript.createData(new QueryScript(el, options));
    QS.mount();
  }

  return QueryScript;
}
