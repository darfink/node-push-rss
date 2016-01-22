module.exports = function(str) {
  return str.replace(/<br\s*\/?>/mg,"\n");
};
