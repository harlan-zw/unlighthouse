import Sitemapper from "sitemapper";

export const extractSiteRoutes = async (site) => {
    const sitemap = new Sitemapper({
        timeout: 15000, // 15 seconds
    });

    const { sites } = await sitemap.fetch(site + '/sitemap-pages.xml');
    return sites
}
