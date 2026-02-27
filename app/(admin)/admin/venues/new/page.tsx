import { ADMIN_IMAGE_ALT_REQUIRED } from "@/lib/admin-policy";
import AdminEntityForm from "@/app/(admin)/admin/_components/AdminEntityForm";

export default function AdminNewVenue() {
  return (
    <AdminEntityForm
      title="New Venue"
      endpoint="/api/admin/venues"
      method="POST"
      redirectPath="/admin/venues"
      uploadTargetType="venue"
      uploadTargetId="new"
      initial={{ name: "", slug: "", description: "", addressLine1: "", addressLine2: "", city: "", region: "", postcode: "", country: "", lat: "", lng: "", timezone: "", websiteUrl: "", instagramUrl: "", contactEmail: "", featuredImageUrl: "", featuredAssetId: "", isPublished: false }}
      fields={[
        { name: "name", label: "Name" },
        { name: "slug", label: "Slug" },
        { name: "description", label: "Description" },
        { name: "addressLine1", label: "Address Line 1" },
        { name: "addressLine2", label: "Address Line 2" },
        { name: "city", label: "City" },
        { name: "region", label: "Region" },
        { name: "postcode", label: "Postcode" },
        { name: "country", label: "Country" },
        { name: "lat", label: "Latitude" },
        { name: "lng", label: "Longitude" },
        { name: "timezone", label: "Timezone (IANA)" },
        { name: "websiteUrl", label: "Website URL" },
        { name: "instagramUrl", label: "Instagram URL" },
        { name: "contactEmail", label: "Contact Email" },
        { name: "featuredImageUrl", label: "Featured Image URL" },
        { name: "featuredAssetId", label: "Featured Asset ID" },
      ]}
      altRequired={ADMIN_IMAGE_ALT_REQUIRED}
    />
  );
}
