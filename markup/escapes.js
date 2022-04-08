module.exports.escapeXml = text => text
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;")

module.exports.escape12y = text => text.replace(/[\\\/\{\*>_~`]/g, "\\$&")

module.exports.escapeMd = text => String(text).replace(/[\\*`_~]/g, "\\$&")