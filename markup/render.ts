const { escapeMd, escapeXml } = require("./escapes.js");
const { Markup } = require('markup2/parse')

const toMd = node => {
	if(node === undefined) {
		return "";
	}
	if(typeof(node) === "string") {
		return escapeMd(node);
	}
	if(Array.isArray(node)) {
		return node.map(toMd).join("");
	}
	
	switch(node.type) {
		case "newline":
			return "\n";
		case "divider":
			return "---\n";
		case "code":
			return "```" + (node.args.lang || "") + "\n" + node.args.text + "```";
		case "icode":
			return "`" + node.args.text + "`";
		case "simple_link":
			return node.args.url + (node.args.text && node.args.text !== node.args.url ? " [" + escapeMd(node.args.text) + "] " : "");
		case "image":
			return node.args.url + (node.args.alt && node.args.alt !== node.args.url ? " [" + escapeMd(node.args.alt) + "] " : "") + "\n";
		case "error":
			return "(error in parser)";
		case "audio":
			return node.args.url;
		case "video":
			return node.args.url;
		case "italic":
			return "*" + toMd(node.content) + "*";
		case "bold":
			return "**" + toMd(node.content) + "**";
		case "strikethrough":
			return "~~" + toMd(node.content) + "~~";
		case "underline":
			return "__" + toMd(node.content) + "__";
		case "heading":
			return "#".repeat(node.args.level) + " " + toMd(node.content) + "\n";
		case "quote":
			return (node.args.cite ? "(" + escapeMd(node.args.cite) + ")\n" : "") +
				"> " + toMd(node.content).split("\n").join("\n> ") + "\n";
		case "table_row":
			return toMd(node.content) + "\n";
		case "table_cell":
			return "|" +
				(node.args.header ? "**" : "") +
				toMd(node.content) +
				(node.args.header ? "**" : "");
		case "link":
			return node.args.url + " [" + toMd(node.content) + "] ";
		case "list":
			if(node.args.style) { // ol
				return toMd(node.content);
			}
			return toMd(node.content);
		case "list_item":
			return "- " + toMd(node.content).split("\n").join("\n  ") + "\n";
		case "subscript":
			return "{#sub " + toMd(node.content) + "}";
		case "superscript":
			return "{#sup " + toMd(node.content) + "}";
		case "ruby":
			return "{#ruby=" + escapeMd(node.args.text) + " " + toMd(node.content) + "}";
		case "spoiler":
			return (node.args.label ? "(spoiler: " + escapeMd(node.args.label) + ") " : "") +
				"||" + toMd(node.content) + "||\n";
		case "background_color":
			return "{#bg=" + escapeMd(node.args.color) + " " + toMd(node.content) + "}";
		default:
			return toMd(node.content);
	}
}

var autocloseTags = {
	"br": true,
	"img": true,
	"hr": true,
}
	
const renderNode = (node) => {
	if(typeof(node) === "string") {
		return escapeXml(node);
	}
	
	let out = "";
	if(node.tag) {
		out += "<" + node.tag;
		
		if(node.attr) {
			for(let i in node.attr) {
				if(node.attr[i] == undefined) {
					continue;
				}
				out += " " + escapeXml(i) + '="' + escapeXml(node.attr[i]) + '"'
			}
		}
		
		if(autocloseTags[node.tag]) {
			out += " />";
			return out;
		}
		
		out += ">";
	}
	
	if(typeof(node.children) === "string") {
		out += node.children;
	} else {
		for(const child of (node.children || [])) {
			out += renderNode(child);
		}
	}
	
	if(node.tag) {
		out += "</" + node.tag + ">";
	}
	
	return out;
}

const toHtml = node => {
	if(node === undefined) {
		return "";
	}
	if(typeof(node) === "string") {
		return escapeXml(node);
	}
	if(Array.isArray(node)) {
		return node.map(toHtml).join("");
	}
	
	switch(node.type) {
		case "newline":
			return renderNode({tag: "br"});
		case "divider":
			return renderNode({tag: "br"});
		case "code":
			return renderNode({
				tag: "pre",
				children: [
					{
						tag: "code",
						attr: {
							"class": node.args.lang ? "language-" + node.args.lang : undefined,
						},
						children: [node.args.text]
					}
				]
			})
		case "icode":
			return renderNode({
				tag: "code",
				children: [node.args.text]
			})
		case "simple_link":
			return renderNode({
				tag: "a",
				attr: {
					href: node.args.url,
					target: "_blank"
				},
				children: [node.args.text]
			})
		case "image":
			// matrix doesn't display images that don't have a mxc:// url
			// but will preview links to images
			return renderNode({
				tag: "a",
				attr: {
					href: node.args.url,
					target: "_blank",
				},
				children: [node.args.alt]
			})
		case "error":
			return renderNode({
				tag: "span",
				children: ["(error in parser)"]
			})
		case "audio":
			return renderNode({
				tag: "a",
				attr: {
					href: node.args.url,
					target: "_blank"
				},
				children: [node.args.url]
			})
		case "video":
			return renderNode({
				tag: "a",
				attr: {
					href: node.args.url,
					target: "_blank"
				},
				children: [node.args.url]
			})
		case "italic":
			return renderNode({
				tag: "i",
				children: toHtml(node.content)
			})
		case "bold":
			return renderNode({
				tag: "b",
				children: toHtml(node.content)
			})
		case "strikethrough":
			return renderNode({
				tag: "s",
				children: toHtml(node.content)
			})
		case "underline":
			return renderNode({
				tag: "u",
				children: toHtml(node.content)
			})
		case "heading":
			return renderNode({
				tag: "h" + node.args.level,
				children: toHtml(node.content)
			})
		case "quote":
			return renderNode({
				tag: "blockquote",
				children: node.args.cite ? [
					{
						tag: "cite",
						children: [node.args.cite]
					},
					{
						children: toHtml(node.content)
					}
				] : toHtml(node.content)
			})
		case "table":
			return renderNode({
				tag: "table",
				children: [{
					tag: "tbody",
					children: toHtml(node.content)
				}]
			})
		case "table_row":
			return renderNode({
				tag: "tr",
				children: toHtml(node.content)
			})
		case "table_cell":
			return renderNode({
				tag: node.args.header ? "th" : "td",
				attr: {
					colspan: node.args.colspan,
					rowspan: node.args.rowspan,
					align: node.args.align,
				},
				children: toHtml(node.content)
			})
		case "link":
			return renderNode({
				tag: "a",
				attr: {
					href: node.args.url,
					target: "_blank"
				},
				children: toHtml(node.content)
			})
		case "list":
			return renderNode({
				tag: node.args.style ? "ol" : "ul",
				children: toHtml(node.content)
			})
		case "list_item":
			return renderNode({
				tag: "li",
				children: toHtml(node.content)
			})
		case "subscript":
			return renderNode({
				tag: "sub",
				children: toHtml(node.content)
			})
		case "superscript":
			return renderNode({
				tag: "sup",
				children: toHtml(node.content)
			})
		case "ruby":
			return renderNode({
				tag: "ruby",
				children: [
					{
						tag: "span",
						children: toHtml(node.content)
					},
					{
						tag: "rt",
						children: [node.args.text]
					}
				]
			})
		case "spoiler":
			return renderNode({
				tag: "span",
				attr: {
					"data-mx-spoiler": node.args.label || ""
				},
				children: toHtml(node.content)
			})
		case "background_color":
			return renderNode({
				tag: "span",
				attr: {
					"data-mx-bg-color": node.args.color
				},
				children: toHtml(node.content)
			})
		default:
			return toHtml(node.content);
	}
}


const markuprenderToHtml = function({args, content}) {
	try {
		return toHtml(content);
	} catch(err) {
		return escapeXml((err as Error).message);
	}
}

const markuprenderToMd = function({args, content}) {
	try {
		return toMd(content);
	} catch(err) {
		return escapeMd((err as Error).message);
	}
}

Markup.INJECT = Markup => {
	Markup.render = markuprenderToMd;
}