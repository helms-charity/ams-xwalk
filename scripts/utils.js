/* add a block id_number to a block instance (when any decorate(block) defines it)
  to be used for martech tracking, aria-controls, aria-labelledby, etc.
*/
const blockIds = {};
export function getBlockId(name) {
  const forBlock = blockIds[name] || 0;
  blockIds[name] = forBlock + 1;
  return `${name}_${forBlock}`;
}

/**
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to?.setAttribute(attr, value); // optional chaining for accordion block
      from?.removeAttribute(attr); // optional chaining for accordion block
    }
  });
}

// Purpose of this function is to copy all attributes from source element to target element.
// This is used to copy all attributes from a tab section to the new section.
export function moveAllAttributes(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName),
  );
}

/**
   * Move instrumentation attributes from a given element to another given element.
   * @param {Element} from the element to copy attributes from
   * @param {Element} to the element to copy attributes to
   */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}
