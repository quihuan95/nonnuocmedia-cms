import type { Schema, Struct } from '@strapi/strapi';

export interface EvaluateHomeGallery extends Struct.ComponentSchema {
  collectionName: 'components_evaluate_home_galleries';
  info: {
    displayName: 'Home Gallery';
  };
  attributes: {
    avatar: Schema.Attribute.Media<'images' | 'files'>;
    content: Schema.Attribute.Text;
    position: Schema.Attribute.String;
    rating: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 5;
          min: 1;
        },
        number
      > &
      Schema.Attribute.DefaultTo<5>;
    title: Schema.Attribute.String;
    username: Schema.Attribute.String;
  };
}

export interface GalleyHomeGallery extends Struct.ComponentSchema {
  collectionName: 'components_galley_home_galleries';
  info: {
    displayName: 'Home Gallery';
  };
  attributes: {
    image: Schema.Attribute.Media<'images' | 'files'>;
    label: Schema.Attribute.String;
  };
}

export interface GalleyPostGallery extends Struct.ComponentSchema {
  collectionName: 'components_galley_post_galleries';
  info: {
    displayName: 'Post Gallery';
  };
  attributes: {
    image: Schema.Attribute.Media<'images' | 'files'>;
    label: Schema.Attribute.String;
  };
}

export interface NavigationMenuChild extends Struct.ComponentSchema {
  collectionName: 'components_navigation_menu_children';
  info: {
    displayName: 'menu-child';
    icon: 'bulletList';
  };
  attributes: {
    label: Schema.Attribute.String & Schema.Attribute.Required;
    type: Schema.Attribute.Enumeration<['internal', 'external', 'sold_out']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'internal'>;
    url: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface NavigationMenuItem extends Struct.ComponentSchema {
  collectionName: 'components_navigation_menu_items';
  info: {
    displayName: 'menu-item';
    icon: 'bulletList';
  };
  attributes: {
    children: Schema.Attribute.Component<'navigation.menu-child', true>;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    type: Schema.Attribute.Enumeration<['internal', 'external', 'sold_out']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'internal'>;
    url: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'evaluate.home-gallery': EvaluateHomeGallery;
      'galley.home-gallery': GalleyHomeGallery;
      'galley.post-gallery': GalleyPostGallery;
      'navigation.menu-child': NavigationMenuChild;
      'navigation.menu-item': NavigationMenuItem;
    }
  }
}
