  for (var i = this.numFields - 1; i >= 0; i--)
    this.removeField(this.getNthFieldName(i));
  app.alert("Champs supprimés.");