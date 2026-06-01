export default {
  async beforeCreate(event: any) {
    await setDisplayTitle(event);
  },
  async beforeUpdate(event: any) {
    await setDisplayTitle(event);
  },
};

async function setDisplayTitle(event: any) {
  const { data } = event.params;
  const siteInput = data.site;
  if (!siteInput) return;

  const siteId = typeof siteInput === 'object' ? siteInput.id : siteInput;
  if (!siteId) return;

  const site = await strapi.entityService.findOne('api::site.site', siteId, {
    fields: ['name'],
  });

  if (site?.name) {
    data.displayTitle = `${site.name} Review`;
  }
}
