function makeRandomId(size) {
  var text = '', possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for( var i=0; i < size; i++ )
    text += possible[Math.floor(Math.random() * 62)];

  return text;
}

module.exports = {
  makeRandomId: makeRandomId
}
