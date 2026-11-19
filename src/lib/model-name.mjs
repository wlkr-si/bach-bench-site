export function modelName(model) {
  return model.replace(/^(GPT-[\d.]+)-([A-Za-z]+)$/, '$1 $2');
}
